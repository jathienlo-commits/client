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

// Parse human-readable duration into an ISO expiry date string
// Accepts: "1 week", "5 hours", "30 minutes", "2 days", "lifetime", "1 month", "1 year"
function parseDuration(input) {
    if (!input) return null
    const s = input.trim().toLowerCase()
    if (s === 'lifetime' || s === 'never' || s === 'permanent') return null

    const units = {
        minute: 60, minutes: 60, min: 60, mins: 60,
        hour: 3600, hours: 3600, hr: 3600, hrs: 3600,
        day: 86400, days: 86400,
        week: 604800, weeks: 604800, wk: 604800, wks: 604800,
        month: 2592000, months: 2592000, mo: 2592000,
        year: 31536000, years: 31536000, yr: 31536000, yrs: 31536000,
    }

    const match = s.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/)
    if (!match) return 'invalid'

    const amount = parseFloat(match[1])
    const unit = match[2]
    const seconds = units[unit]
    if (!seconds) return 'invalid'

    const expiry = new Date(Date.now() + amount * seconds * 1000)
    return expiry.toISOString()
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
        .setDescription('Create a new key and optionally send it to a user')
        .addStringOption(o => o.setName('id').setDescription('Loader ID').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Discord user to send the key to').setRequired(false))
        .addStringOption(o => o.setName('duration').setDescription('e.g. lifetime, 1 week, 5 hours, 30 days').setRequired(false))
        .addStringOption(o => o.setName('note').setDescription('Label for the key').setRequired(false))
        .addIntegerOption(o => o.setName('max_uses').setDescription('Max uses (omit for unlimited)').setRequired(false)),

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
            const targetUser = interaction.options.getUser('user')
            const durationInput = interaction.options.getString('duration')
            const note = interaction.options.getString('note')
            const max_uses = interaction.options.getInteger('max_uses')

            // Parse duration
            let expires_at = null
            let durationLabel = 'lifetime'
            if (durationInput) {
                const parsed = parseDuration(durationInput)
                if (parsed === 'invalid') {
                    return interaction.editReply(
                        `❌ Invalid duration \`${durationInput}\`.\nExamples: \`lifetime\`, \`1 week\`, \`5 hours\`, \`30 days\`, \`2 months\``
                    )
                }
                expires_at = parsed
                durationLabel = durationInput
            }

            // Build request body
            const body = {}
            if (note) body.note = note
            if (max_uses) body.max_uses = max_uses
            if (expires_at) body.expires_at = expires_at

            const data = await astro('POST', `/api/loader/${id}/keys`, body)
            if (!data.success) return interaction.editReply(`Error: ${JSON.stringify(data)}`)

            const keyValue = data.data.key_value

            // Reply in channel
            const channelEmbed = new EmbedBuilder()
                .setTitle('Key Created')
                .setColor(0x00ff88)
                .addFields(
                    { name: 'Loader', value: `\`${id}\``, inline: true },
                    { name: 'Duration', value: durationLabel, inline: true },
                    { name: 'Max Uses', value: max_uses ? String(max_uses) : 'unlimited', inline: true },
                    { name: 'Expires', value: expires_at ? `<t:${Math.floor(new Date(expires_at).getTime() / 1000)}:F>` : 'never', inline: false },
                )
            if (note) channelEmbed.addFields({ name: 'Note', value: note, inline: false })
            if (targetUser) channelEmbed.addFields({ name: 'Sent to', value: `${targetUser}`, inline: false })

            await interaction.editReply({ embeds: [channelEmbed] })

            // DM the user if specified
            if (targetUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🔑 You received a key')
                        .setColor(0x00ff88)
                        .setDescription(`${interaction.user} sent you a key.`)
                        .addFields(
                            { name: 'Key', value: `\`\`\`${keyValue}\`\`\``, inline: false },
                            { name: 'Duration', value: durationLabel, inline: true },
                            { name: 'Max Uses', value: max_uses ? String(max_uses) : 'unlimited', inline: true },
                            { name: 'Expires', value: expires_at ? `<t:${Math.floor(new Date(expires_at).getTime() / 1000)}:F>` : 'never', inline: false },
                        )
                    if (note) dmEmbed.addFields({ name: 'Note', value: note, inline: false })
                    await targetUser.send({ embeds: [dmEmbed] })
                } catch {
                    // User has DMs closed — follow up in channel with the key visible to the invoker
                    await interaction.followUp({
                        content: `⚠️ Could not DM ${targetUser} (DMs closed). Key: \`${keyValue}\``,
                        ephemeral: true
                    })
                }
            } else {
                // No user — send key ephemerally to invoker so it's not public
                await interaction.followUp({
                    content: `🔑 Key: \`${keyValue}\``,
                    ephemeral: true
                })
            }

            return
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
