const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js')

const ASTRO_KEY = 'astro_876476df8dca87c719dae859607b684b'
const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const BASE_URL = 'https://astroprotect.net'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

async function astro(method, path, body = null) {
    const opts = {
        method,
        headers: { 'AstroKey': ASTRO_KEY, 'Content-Type': 'application/json' }
    }
    if (body) opts.body = JSON.stringify(body)
    const res = await fetch(`${BASE_URL}${path}`, opts)
    return res.json()
}

const commands = [
    new SlashCommandBuilder()
        .setName('health')
        .setDescription('Check API health'),

    new SlashCommandBuilder()
        .setName('loaders')
        .setDescription('List all your loaders'),

    new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('Get loader analytics')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true)),

    new SlashCommandBuilder()
        .setName('keys')
        .setDescription('List keys for a loader')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true)),

    new SlashCommandBuilder()
        .setName('createkey')
        .setDescription('Create a new key for a loader')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Label for the key').setRequired(false))
        .addIntegerOption(o => o.setName('max_uses').setDescription('Max uses (omit for unlimited)').setRequired(false))
        .addStringOption(o => o.setName('expires_at').setDescription('Expiry ISO date (omit for never)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('revokekey')
        .setDescription('Revoke or restore a key')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true))
        .addIntegerOption(o => o.setName('key_id').setDescription('Numeric key ID').setRequired(true))
        .addStringOption(o => o.setName('status').setDescription('active or revoked').setRequired(true)
            .addChoices({ name: 'active', value: 'active' }, { name: 'revoked', value: 'revoked' }))
        .addBooleanOption(o => o.setName('reset_hwid').setDescription('Reset linked HWID').setRequired(false)),

    new SlashCommandBuilder()
        .setName('deletekey')
        .setDescription('Permanently delete a key')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true))
        .addIntegerOption(o => o.setName('key_id').setDescription('Numeric key ID').setRequired(true)),

    new SlashCommandBuilder()
        .setName('updateloader')
        .setDescription('Update loader settings')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('New name').setRequired(false))
        .addStringOption(o => o.setName('status').setDescription('active or disabled').setRequired(false)
            .addChoices({ name: 'active', value: 'active' }, { name: 'disabled', value: 'disabled' }))
        .addBooleanOption(o => o.setName('auth_enabled').setDescription('Enable auth').setRequired(false))
        .addStringOption(o => o.setName('hwid_lock').setDescription('off / log / enforce').setRequired(false)
            .addChoices({ name: 'off', value: 'off' }, { name: 'log', value: 'log' }, { name: 'enforce', value: 'enforce' })),

    new SlashCommandBuilder()
        .setName('deleteloader')
        .setDescription('Permanently delete a loader')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true)),
]

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`)
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) })
    console.log('Slash commands registered')
})

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return
    await interaction.deferReply()

    const cmd = interaction.commandName

    try {
        if (cmd === 'health') {
            const data = await astro('GET', '/api/health')
            const embed = new EmbedBuilder()
                .setTitle('API Health')
                .setColor(data.status === 'ok' ? 0x00ff88 : 0xff4444)
                .addFields(
                    { name: 'Status', value: data.status ?? 'unknown', inline: true },
                    { name: 'Database', value: data.database ?? 'unknown', inline: true },
                    { name: 'Timestamp', value: data.timestamp ?? 'unknown', inline: false }
                )
            return interaction.editReply({ embeds: [embed] })
        }

        if (cmd === 'loaders') {
            const data = await astro('GET', '/api/loaders')
            const projects = data.data?.projects ?? []
            if (!projects.length) return interaction.editReply('No loaders found.')
            const embed = new EmbedBuilder()
                .setTitle('Your Loaders')
                .setColor(0x5865f2)
            for (const p of projects.slice(0, 10)) {
                embed.addFields({
                    name: `${p.name} \`${p.project_id}\``,
                    value: [
                        `Status: **${p.status}**`,
                        `Auth: **${p.auth_enabled ? 'on' : 'off'}**`,
                        `HWID: **${p.hwid_lock}**`,
                        `Hits: **${p.hits}**`,
                        `Last served: ${p.last_served ? new Date(p.last_served).toLocaleString() : 'never'}`
                    ].join('\n'),
                    inline: false
                })
            }
            return interaction.editReply({ embeds: [embed] })
        }

        if (cmd === 'analytics') {
            const id = interaction.options.getString('id')
            const data = await astro('GET', `/api/loader/${id}/analytics`)
            if (!data.success) return interaction.editReply(`Error: ${JSON.stringify(data)}`)
            const t = data.data.totals
            const embed = new EmbedBuilder()
                .setTitle(`Analytics — ${id}`)
                .setColor(0x5865f2)
                .addFields(
                    { name: 'Auth OK', value: String(t.auth_ok), inline: true },
                    { name: 'Auth Fail', value: String(t.auth_fail), inline: true },
                    { name: 'Heartbeats OK', value: String(t.beat_ok), inline: true },
                    { name: 'HWID Mismatches', value: String(t.hwid_mismatch), inline: true },
                    { name: 'Distinct HWIDs', value: String(t.distinct_hwid), inline: true },
                    { name: 'Distinct IPs', value: String(t.distinct_ip), inline: true },
                )
            const topReasons = data.data.reasons?.slice(0, 3).map(r => `${r.result}: ${r.n}`).join('\n') || 'none'
            embed.addFields({ name: 'Top Fail Reasons', value: topReasons, inline: false })
            return interaction.editReply({ embeds: [embed] })
        }

        if (cmd === 'keys') {
            const id = interaction.options.getString('id')
            const data = await astro('GET', `/api/loader/${id}/keys`)
            if (!data.success) return interaction.editReply(`Error: ${JSON.stringify(data)}`)
            const keys = data.data.keys ?? []
            if (!keys.length) return interaction.editReply('No keys found.')
            const embed = new EmbedBuilder()
                .setTitle(`Keys — ${id}`)
                .setColor(0x5865f2)
            for (const k of keys.slice(0, 10)) {
                embed.addFields({
                    name: `\`${k.key_value}\` (ID: ${k.id})`,
                    value: [
                        `Note: ${k.note || 'none'}`,
                        `Uses: ${k.uses}/${k.max_uses ?? '∞'}`,
                        `Status: **${k.status}**`,
                        `HWID: ${k.hwid || 'unbound'}`,
                        `Expires: ${k.expires_at || 'never'}`,
                        `Last used: ${k.last_used ? new Date(k.last_used).toLocaleString() : 'never'}`
                    ].join('\n'),
                    inline: false
                })
            }
            return interaction.editReply({ embeds: [embed] })
        }

        if (cmd === 'createkey') {
            const id = interaction.options.getString('id')
            const body = {}
            const note = interaction.options.getString('note')
            const max_uses = interaction.options.getInteger('max_uses')
            const expires_at = interaction.options.getString('expires_at')
            if (note) body.note = note
            if (max_uses) body.max_uses = max_uses
            if (expires_at) body.expires_at = expires_at
            const data = await astro('POST', `/api/loader/${id}/keys`, body)
            if (!data.success) return interaction.editReply(`Error: ${JSON.stringify(data)}`)
            const embed = new EmbedBuilder()
                .setTitle('Key Created')
                .setColor(0x00ff88)
                .addFields({ name: 'Key', value: `\`${data.data.key_value}\``, inline: false })
            return interaction.editReply({ embeds: [embed] })
        }

        if (cmd === 'revokekey') {
            const id = interaction.options.getString('id')
            const keyId = interaction.options.getInteger('key_id')
            const status = interaction.options.getString('status')
            const resethwid = interaction.options.getBoolean('reset_hwid')
            const body = { status }
            if (resethwid !== null) body.resethwid = resethwid
            const data = await astro('PATCH', `/api/loader/${id}/keys/${keyId}`, body)
            return interaction.editReply(data.success ? `Key ${keyId} set to **${status}**.` : `Error: ${JSON.stringify(data)}`)
        }

        if (cmd === 'deletekey') {
            const id = interaction.options.getString('id')
            const keyId = interaction.options.getInteger('key_id')
            const data = await astro('DELETE', `/api/loader/${id}/keys/${keyId}`)
            return interaction.editReply(data.success ? `Key ${keyId} permanently deleted.` : `Error: ${JSON.stringify(data)}`)
        }

        if (cmd === 'updateloader') {
            const id = interaction.options.getString('id')
            const body = {}
            const name = interaction.options.getString('name')
            const status = interaction.options.getString('status')
            const auth_enabled = interaction.options.getBoolean('auth_enabled')
            const hwid_lock = interaction.options.getString('hwid_lock')
            if (name) body.name = name
            if (status) body.status = status
            if (auth_enabled !== null) body.auth_enabled = auth_enabled
            if (hwid_lock) body.hwid_lock = hwid_lock
            const data = await astro('PATCH', `/api/loader/${id}`, body)
            return interaction.editReply(data.success ? `Loader \`${id}\` updated.` : `Error: ${JSON.stringify(data)}`)
        }

        if (cmd === 'deleteloader') {
            const id = interaction.options.getString('id')
            const data = await astro('DELETE', `/api/loader/${id}`)
            return interaction.editReply(data.success ? `Loader \`${id}\` permanently deleted.` : `Error: ${JSON.stringify(data)}`)
        }

    } catch (err) {
        interaction.editReply(`Request failed: ${err.message}`)
    }
})

client.login(DISCORD_TOKEN)
