import { createLabelTexture } from '../../world.js';
import { generateAIText, generateSchedulerText } from '../../ai.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class MafiaGame {
    constructor(players, ui, environment, audio, achievements) {
        this.players = players;
        this.ui = ui;
        this.environment = environment;
        this.audio = audio;
        this.achievements = achievements;
        this.roles = {
            MAFIA: 'Mafia',
            SHERIFF: 'Sheriff',
            HEALER: 'Doctor',
            CITIZEN: 'Villager',
            VIGILANTE: 'Vigilante'
        };
        this.settings = { aiPlayers: [], geminiApiKey: '', geminiModel: '', schedulerApiKey: '', schedulerModel: '', disableAbstaining: false, ragdolls: false, chaosMode: false };
        this.resetMatchState();

        this.ui.onNextSpeakerRequest = id => { this.nextSpeakerId = id; };
        this.ui.onPauseToggle = () => {
            this.paused = !this.paused;
            return this.paused;
        };
        this.setupTrollHandlers();
    }

    resetMatchState() {
        this.dayCount = 0;
        this.gameActive = true;
        this.forceStop = false;
        this.paused = false;
        this.currentPhase = 'init';
        this.currentDiscussionLog = [];
        this.publicHistory = [];
        this.privateHistory = { mafia: [], doctor: [], sheriff: [], vigilante: [] };
        this.privateIntel = { sheriff: [], doctor: [] };
        this.voteHistory = [];
        this.liveVoteState = null;
        this.revealedInfo = [];
        this.lastNightEvents = 'No night has happened yet.';
        this.matchId = '';
        this.nextSpeakerId = null;
        this.lastSpeakerId = null;
        this.turnNumber = 0;
        this.turnsSinceSpoke = {};
        this.lastDoctorSaveId = null;
        this.nightDoctorSaveId = null;
        this.vigilanteUsed = false;
        this.nightVigilanteTargetId = null;
        this.sheriffRevealedIds = new Set();
        this.mafiaTargetId = null;
        this.silencedPlayerId = null;
        this.trollVoteVictim = null;
        this.phaseSkipTriggered = false;
        this.usedMessages = new Set();
    }

    async sleep(ms) {
        const until = Date.now() + ms;
        while (Date.now() < until) {
            if (this.forceStop) throw new Error('GameStopped');
            await new Promise(resolve => setTimeout(resolve, Math.min(100, until - Date.now())));
        }
    }

    async generateText(request, player = null) {
        const config = player?.aiConfig || this.settings.aiPlayers?.[player?.id] || {};
        return generateAIText(request.messages, config, this.settings);
    }

    getAIErrorText(error) {
        return `AI unavailable: ${String(error?.message || error || 'request failed').replace(/[\r\n]+/g, ' ').slice(0, 120)}`;
    }

    async activeMessageWait(ms, timerState = null) {
        let remaining = ms;
        let last = Date.now();
        while (remaining > 0) {
            if (this.forceStop) throw new Error('GameStopped');
            await new Promise(resolve => setTimeout(resolve, 100));
            const now = Date.now();
            const elapsed = now - last;
            if (!this.paused) {
                remaining -= elapsed;
                if (timerState) {
                    timerState.ms = Math.max(0, timerState.ms - elapsed);
                    this.ui.setPhaseTimer(timerState.ms / 1000);
                }
            }
            last = now;
        }
    }

    alive() { return this.players.filter(player => player.alive); }
    mafia() { return this.alive().filter(player => player.role === this.roles.MAFIA); }
    good() { return this.alive().filter(player => player.role !== this.roles.MAFIA); }
    isEvil(player) { return player?.role === this.roles.MAFIA; }

    ledger(viewer = null, channel = 'public') {
        const alive = this.alive();
        const dead = this.players.filter(player => !player.alive);
        const revealed = this.revealedInfo.length ? this.revealedInfo.map(info => `${info.name} was ${info.role}`).join('; ') : 'None';
        // Keep enough of the public archive for a night decision to use the
        // arguments and votes from earlier days, not just the last few lines.
        // Night rooms may see this archive, but never see another role's
        // private room.
        const history = this.publicHistory.slice(-120).map(entry => `Day ${entry.day}: ${entry.name}: ${entry.message}`).join('\n') || 'No public discussion yet.';
        const viewerChannel = viewer?.role === this.roles.MAFIA ? 'mafia' :
            viewer?.role === this.roles.HEALER ? 'doctor' :
                viewer?.role === this.roles.SHERIFF ? 'sheriff' :
                    viewer?.role === this.roles.VIGILANTE ? 'vigilante' : null;
        const visibleChannel = channel !== 'public' ? channel : viewerChannel;
        const privateLog = visibleChannel ? (this.privateHistory[visibleChannel] || []).slice(-40).map(entry => {
            const thoughts = entry.thoughts ? `Thoughts: ${entry.thoughts}` : 'Thoughts: not recorded';
            return `${entry.name} — ${thoughts} | Message: ${entry.message}`;
        }).join('\n') || 'No private night discussion in this room yet.' : '';
        const previousVotes = this.voteHistory.slice(-8).map(round => `Day ${round.day}: ${round.records.map(record => `${record.voter} → ${record.target || 'ABSTAIN'}`).join(', ')}; result: ${round.result}`).join('\n') || 'No previous vote rounds.';
        const sheriffIntel = Array.isArray(this.privateIntel.sheriff)
            ? this.privateIntel.sheriff.map(report => `Day ${report.day}: ${report.targetName} was ${report.result} when investigated; currently ${this.players.find(player => player.id === report.targetId)?.alive ? 'alive' : 'dead'}.`).join(' ') || 'None yet.'
            : String(this.privateIntel.sheriff || 'None yet.');
        const doctorMemory = Array.isArray(this.privateIntel.doctor)
            ? this.privateIntel.doctor.map(entry => `Night ${entry.day}: I protected ${entry.targetName}; ${entry.success ? 'it stopped the Mafia attack.' : 'it did not stop a Mafia attack.'}`).join(' ') || 'No save results yet.'
            : String(this.privateIntel.doctor || 'No save results yet.');
        const currentVotes = this.liveVoteState
            ? `CURRENT VOTE STATUS: ${this.liveVoteState.submittedCount}/${this.liveVoteState.totalEligible} votes submitted. Submitted: ${this.liveVoteState.records.map(record => `${record.voter} → ${record.target || 'ABSTAIN'}`).join(', ') || 'none'}. Tally: ${Object.entries(this.liveVoteState.tally).map(([name, count]) => `${name}=${count}`).join(', ') || 'none'}.`
            : 'No vote is currently in progress.';
        return [
            `MATCH ID: ${this.matchId}. This is a new match; never use facts from another match or an earlier run.`,
            `PHASE: ${this.currentPhase}. DAY: ${this.dayCount}.`,
            `ALIVE: ${alive.map(player => player.name).join(', ') || 'Nobody'}.`,
            `ELIMINATED THIS MATCH: ${dead.map(player => player.name).join(', ') || 'Nobody'}.`,
            `ROLE REVEALS THIS MATCH: ${revealed}.`,
            `LAST NIGHT RESULT: ${this.lastNightEvents}.`,
            `PUBLIC DISCUSSION ARCHIVE FROM THIS MATCH (AVAILABLE DURING NIGHT, INCLUDING PRIOR DAYS):\n${history}`,
            `PREVIOUS VOTE ROUNDS FROM THIS MATCH:\n${previousVotes}`,
            currentVotes,
            privateLog ? `PRIVATE NIGHT MEMORY FOR YOUR ROLE (NOT PUBLIC; ONLY THIS ROLE'S NIGHT ROOM):\n${privateLog}` : '',
            viewer?.role === this.roles.SHERIFF ? `PRIVATE SHERIFF RESULTS: ${sheriffIntel}` : '',
            viewer?.role === this.roles.HEALER ? `PRIVATE DOCTOR MEMORY: ${doctorMemory}` : ''
        ].filter(Boolean).join('\n');
    }

    parseObject(text) {
        const value = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const match = value.match(/\{[\s\S]*\}/);
        if (!match) return {};
        try { return JSON.parse(match[0]); } catch { return {}; }
    }

    normalizeMessage(text) {
        return String(text || '').replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ').trim();
    }

    accusationScore(target) {
        if (!target) return 0;
        const targetName = target.name.toLowerCase();
        const accusationWords = /mafia|suspect|suspicious|accus|framed|lying|liar|shady|scum|evil|vote|hammer|eliminate|kill/;
        const discussionScore = this.currentDiscussionLog.reduce((score, entry) => {
            const text = String(entry.message || '').toLowerCase();
            if (!text.includes(targetName)) return score;
            return score + (accusationWords.test(text) ? 3 : 1);
        }, 0);
        const voteScore = this.voteHistory.reduce((score, round) => score + round.records.filter(record => record.target === target.name).length, 0);
        return discussionScore + voteScore;
    }

    livingSheriffReport() {
        const reports = this.privateIntel.sheriff
            .map(report => ({ report, target: this.players.find(candidate => candidate.id === report.targetId) }))
            .filter(item => item.target?.alive && !this.sheriffRevealedIds.has(item.target.id));
        return reports.find(item => this.accusationScore(item.target) >= 3) || reports[0] || null;
    }

    guardSheriffDisclosure(player, message, commit = false) {
        if (player.role !== this.roles.SHERIFF || this.currentPhase !== 'day') return message;
        const living = this.livingSheriffReport();
        if (!living || this.accusationScore(living.target) < 3) {
            // Never let a generated line hint at a hidden badge, result, or
            // dead investigation. Even saying "I have data but won't claim"
            // leaks the Sheriff's identity to the whole table.
            return `Let's keep today's case on the living players and test every claim against the public record.`;
        }

        const target = living.target;
        const report = living.report;
        const openings = [
            `I'm the Sheriff.`,
            `I need to reveal my role: I'm the Sheriff.`,
            `Put my Sheriff badge on the table: I'm the Sheriff.`
        ];
        const opening = openings[(this.turnNumber + player.id + this.dayCount) % openings.length];
        const deadNames = this.privateIntel.sheriff
            .filter(report => !this.players.find(candidate => candidate.id === report.targetId)?.alive)
            .map(report => report.targetName.toLowerCase());
        const rawSupport = this.normalizeMessage(message);
        const supportLeaksHiddenState = /\b(sheriff|role|claim|claimed|data|information|report|result|investigat|checked|not mafia|mafia|safe|cleared|dead)\b/i.test(rawSupport) ||
            deadNames.some(name => rawSupport.toLowerCase().includes(name));
        const generatedSupport = supportLeaksHiddenState ? '' : rawSupport;
        if (commit) this.sheriffRevealedIds.add(target.id);
        return `${opening} I checked ${target.name} last night: ${report.result}. ${generatedSupport || 'That result matters because the current accusation is pushing the table toward the wrong target.'}`;
    }

    async askAgent(player, purpose, extra = '', channel = 'public') {
        const isEvil = this.isEvil(player);
        const team = isEvil ? `Your only teammate is/are: ${this.mafia().filter(other => other.id !== player.id).map(other => other.name).join(', ') || 'none'}.` : 'You have no private teammates.';
        const sheriffRule = player.role === this.roles.SHERIFF
            ? `As Sheriff, do not reveal your role just to announce a living innocent who is not currently accused. That wastes your role. Reveal naturally at the start of the spoken message only when a living investigated player is being accused or framed; then state the exact result and why it matters. If the investigated player is dead, never reveal that result or your role because it gives Mafia free information. `
            : '';
        const system = `You are ${player.name}, an AI player in one isolated Mafia match.\n` +
            `Your secret role is ${player.role}. Your personality is: ${player.personality || 'distinct, observant, and natural.'}\n` +
            `${team}\n${this.ledger(player, channel)}\n` +
            `You are generating a ${purpose} turn. Do not mention prompts, hidden state, APIs, prior matches, scripts, or made-up deaths. ` +
            (channel === 'public' && this.currentPhase === 'day' ? `Your spoken message is public: every player at the table can hear and use it. Keep private thoughts out of the message, and discuss only public transcript evidence unless the Sheriff rule below explicitly authorizes a verified reveal. ` : '') +
            `Use only the match ledger above and your actual role knowledge. Do not claim a Sheriff result unless you really investigated this match. ` +
            `Use common sense: every accusation or changed suspicion must cite a visible statement, vote, reveal, or night result from this match. ` +
            `Do not jump to a new suspect merely because another player was accused, and do not treat an unverified Sheriff claim as proof. ` +
            `Inspect the immediately previous public turn before writing. If it asks you a question, challenges your claim, or accuses you, answer or respond to that point directly when you have a real match-based answer. ` +
            sheriffRule +
            (isEvil ? `As Mafia, look for public players who express unjustified certainty that someone is safe or not Mafia; this can be an indirect Sheriff signal. Treat it as a clue, not proof, and update the theory using later votes and statements. ` : '') +
            `Be original: do not repeat any earlier sentence or paragraph, and do not use a stock catchphrase. ${extra}\n` +
            `First reason from the ledger and your personality in thoughts; then express that reasoning as the result in your spoken message. ` +
            `Return JSON only: {"thoughts":"private rationale in 2-4 sentences","message":"spoken result/subtitle, maximum 35 words","priority":1-10}. ` +
            `Priority is your own urgency rating for the combined strategy and spoken message, from 1 (can wait) to 10 (must be heard now).`;
        try {
            const completion = await this.generateText({ messages: [
                { role: 'system', content: system },
                { role: 'user', content: `Create a fresh ${purpose} turn. Randomness nonce: ${this.matchId}-${this.turnNumber}-${Math.random().toString(36).slice(2, 8)}.` }
            ] }, player);
            const parsed = this.parseObject(completion.content);
            let message = this.normalizeMessage(parsed.message || completion.content);
            message = this.guardSheriffDisclosure(player, message);
            if (!message || this.usedMessages.has(message.toLowerCase())) message = this.chooseDistinctFallback(player, purpose);
            this.usedMessages.add(message.toLowerCase());
            return { thoughts: this.normalizeMessage(parsed.thoughts || 'I am weighing the current evidence.'), message, priority: clamp(Number(parsed.priority) || 5, 1, 10) };
        } catch (error) {
            return { thoughts: 'I am recalculating from this match\'s current evidence.', message: this.chooseDistinctFallback(player, purpose), priority: 5, error };
        }
    }

    actionReason(player, target, action) {
        const roleReasons = {
            [this.roles.MAFIA]: `the public record makes ${target.name} the most useful person to remove while keeping our team out of the spotlight`,
            [this.roles.HEALER]: `the public record and the last night result make ${target.name} the player most likely to need protection`,
            [this.roles.SHERIFF]: `${target.name}'s public statements and votes are the strongest unresolved lead to investigate`,
            [this.roles.VIGILANTE]: `${target.name}'s public behavior is the strongest case for using my one shot`,
        };
        return roleReasons[player.role] || `${target.name}'s public statements and votes are the clearest case on the table`;
    }

    bindActionMessage(player, packet, target, action, allowSkip = false) {
        const message = this.normalizeMessage(packet.message);
        const reason = this.normalizeMessage(packet.reason) || (target ? this.actionReason(player, target, action) : 'I need more evidence before committing');
        if (!target) {
            if (!allowSkip) return message || `${action} target unavailable.`;
            const holding = /\b(skip|hold|holding|wait|not\s+(?:shoot|fire|use|act)|save my shot|keep my shot)\b/i.test(message);
            return holding ? message : `${message ? `${message.replace(/[.!?]+$/, '')}. ` : ''}I am holding this action for now because ${reason}.`;
        }

        const targetMentioned = message.toLowerCase().includes(target.name.toLowerCase());
        const reasonMentioned = /\b(because|since|so that|based on|the reason|strongest|evidence|record|behavior|behaviour|vote|statement|result)\b/i.test(message);
        if (targetMentioned && reasonMentioned) return message;

        const cleanMessage = message.replace(/[.!?]+$/, '').trim();
        const actionLower = action.toLowerCase();
        const actionLine = player.role === this.roles.MAFIA || actionLower.includes('hammer')
            ? `My vote is ${target.name}`
            : actionLower.includes('save')
                ? `I am protecting ${target.name}`
                : actionLower.includes('investigat')
                    ? `I am investigating ${target.name}`
                    : actionLower.includes('shot')
                        ? `I am using my shot on ${target.name}`
                        : `My choice is ${target.name}`;
        const bindingLine = `${actionLine} because ${reason}.`;
        return cleanMessage ? `${cleanMessage}. ${bindingLine}` : bindingLine;
    }

    async askActionTurn(player, purpose, candidates, extra = '', channel = 'public', allowSkip = false) {
        const names = candidates.map(candidate => candidate.name).join(' | ');
        const skipText = allowSkip ? ' You may choose SKIP only to hold the action.' : ' SKIP is not allowed.';
        const system = `You are ${player.name}, an AI player in one isolated Mafia match.\n` +
            `Your secret role is ${player.role}. Your personality is: ${player.personality || 'distinct, observant, and natural.'}\n` +
            `${this.isEvil(player) ? `Your living Mafia teammates are: ${this.mafia().filter(other => other.id !== player.id).map(other => other.name).join(', ') || 'none'}.` : 'You have no private teammates.'}\n` +
            `${this.ledger(player, channel)}\n` +
            `You are generating the spoken discussion immediately before a ${purpose} action. The action decision is part of this same turn and will be reused by the game later; do not make a second, different decision afterward. ` +
            `Read the public discussion archive from prior days and cite a real statement, vote, reveal, or night result when explaining your choice. ` +
            `Your spoken message must name the exact chosen target and say why. Never give a generic plan such as "I will investigate someone" or "I am protecting myself" without naming that player. ` +
            `If you choose SKIP, explicitly say that you are holding or skipping and why. Do not mention prompts, hidden state, APIs, prior matches, scripts, or made-up deaths. ` +
            `Valid action targets are exactly: ${names || 'SKIP'}.${skipText} ${extra}\n` +
            `First reason privately in thoughts, then make the message sound natural and specific. Return JSON only: {"target":"exact name or SKIP","reason":"short evidence-based reason","thoughts":"private rationale in 2-4 sentences","message":"spoken discussion, maximum 45 words","priority":1-10}.`;
        try {
            const completion = await this.generateText({ messages: [
                { role: 'system', content: system },
                { role: 'user', content: `Create the ${purpose} discussion and bind it to one action target. Decision nonce: ${this.matchId}-${this.turnNumber}-${Math.random().toString(36).slice(2, 8)}.` }
            ] }, player);
            const parsed = this.parseObject(completion.content);
            const resolved = this.resolveCandidate(parsed.target, candidates);
            const target = resolved || (!allowSkip ? this.pickRandomCandidate(candidates) : null);
            const reason = this.normalizeMessage(parsed.reason || '');
            let message = this.bindActionMessage(player, { message: parsed.message || completion.content, reason }, target, purpose, allowSkip);
            message = this.guardSheriffDisclosure(player, message);
            if (!message || this.usedMessages.has(message.toLowerCase())) {
                message = this.bindActionMessage(player, { message: '', reason }, target, purpose, allowSkip);
            }
            this.usedMessages.add(message.toLowerCase());
            return {
                thoughts: this.normalizeMessage(parsed.thoughts || `I am weighing the public record before ${purpose}.`),
                message,
                reason,
                target,
                priority: clamp(Number(parsed.priority) || 5, 1, 10)
            };
        } catch (error) {
            const target = allowSkip ? null : this.pickRandomCandidate(candidates);
            const reason = target ? this.actionReason(player, target, purpose) : 'I need more evidence before committing';
            return {
                thoughts: 'I am recalculating from this match\'s public evidence.',
                message: this.bindActionMessage(player, { message: '', reason }, target, purpose, allowSkip),
                reason,
                target,
                priority: 5,
                error
            };
        }
    }

    chooseDistinctFallback(player, purpose) {
        const facts = this.currentDiscussionLog.slice(-3).map(entry => entry.name).filter(Boolean);
        const fact = facts.length ? `I want ${facts[facts.length - 1]} to answer for their last point.` : 'I am watching the quietest claim in this room.';
        const variants = [`${fact} My read is still provisional.`, 'I need one concrete answer before I commit.', 'The record matters more than confidence; give us a specific example.'];
        return variants[(this.turnNumber + player.id + purpose.length) % variants.length];
    }

    async askChoice(player, purpose, candidates, extra = '', channel = 'public') {
        const names = candidates.map(candidate => candidate.name).join(' | ');
        const system = `You are ${player.name}, secret role ${player.role}, making a ${purpose} decision in match ${this.matchId}.\n${this.ledger(player, channel)}\n` +
            `Valid choices are exactly: ${names || 'SKIP'}. ${extra}\n` +
            `Never choose a dead player, yourself unless the rules explicitly allow it, or a name not in the valid choices. This is not a continuation of another game. Return JSON only: {"target":"exact name or SKIP","reason":"short reason"}.`;
        try {
            const completion = await this.generateText({ messages: [
                { role: 'system', content: system },
                { role: 'user', content: `Choose for this ${purpose}. Decision nonce: ${this.matchId}-${this.turnNumber}-${Math.random().toString(36).slice(2, 8)}.` }
            ] }, player);
            const parsed = this.parseObject(completion.content);
            return { target: this.resolveCandidate(parsed.target, candidates), reason: this.normalizeMessage(parsed.reason || '') };
        } catch {
            return { target: this.pickRandomCandidate(candidates), reason: '' };
        }
    }

    resolveCandidate(value, candidates) {
        const target = String(value || '').trim().toLowerCase();
        if (target === 'skip' || target === 'none' || target === 'no one') return null;
        return candidates.find(candidate => candidate.name.toLowerCase() === target) || candidates.find(candidate => target.includes(candidate.name.toLowerCase()) || candidate.name.toLowerCase().includes(target)) || null;
    }

    pickRandomCandidate(candidates) {
        return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    async showThought(player, thoughts, timerState = null) {
        if (this.players.some(candidate => candidate.isHuman)) return;
        this.ui.showThoughtDialogue(player, thoughts, this.isEvil(player) ? 'evil' : 'good');
        const duration = clamp(4500 + String(thoughts || '').length * 75, 4500, 12000);
        if (timerState) await this.activeMessageWait(Math.min(duration, timerState.ms), timerState);
        else await this.activeMessageWait(duration);
        this.ui.hideDialogue();
    }

    async showTurn(player, packet, timerState = null, channel = 'public') {
        await this.showThought(player, packet.thoughts, timerState);
        const message = channel === 'public' ? this.guardSheriffDisclosure(player, packet.message, true) : packet.message;
        this.ui.showDialogue(player, message);
        const duration = clamp(1800 + message.length * 35, 2200, 5200);
        if (timerState) await this.activeMessageWait(Math.min(duration, timerState.ms), timerState);
        else await this.activeMessageWait(duration);
        // Private night entries retain both the hidden reasoning and spoken
        // message so that the same role can recall the whole night during day.
        const entry = { name: player.name, id: player.id, message, thoughts: channel === 'public' ? '' : (packet.thoughts || ''), phase: this.currentPhase, day: this.dayCount };
        if (channel === 'public') {
            this.publicHistory.push(entry);
            this.currentDiscussionLog.push(entry);
        } else if (this.privateHistory[channel]) {
            this.privateHistory[channel].push(entry);
        }
        this.turnNumber++;
        this.lastSpeakerId = player.id;
        this.turnsSinceSpoke = Object.fromEntries(this.alive().map(candidate => [candidate.id, (this.turnsSinceSpoke[candidate.id] || 0) + 1]));
        this.turnsSinceSpoke[player.id] = 0;
    }

    async schedulerInjection(scored) {
        if (!scored.length || !(this.settings.schedulerApiKey || this.settings.geminiApiKey)) return null;
        const lastPublicTurn = this.currentDiscussionLog[this.currentDiscussionLog.length - 1];
        const candidateBrief = scored.map(entry => {
            const packet = entry.packet || {};
            return [
                `PLAYER ID: ${entry.player.id}`,
                `NAME: ${entry.player.name}`,
                `TURNS SINCE SPEAKING: ${this.turnsSinceSpoke[entry.player.id] || 0}`,
                `PRIORITY RATING: ${packet.priority ?? 6}/10`,
                `THOUGHTS: ${packet.thoughts || 'Human player; no private AI thoughts available.'}`,
                `MESSAGE: ${packet.message || 'Human player is available to respond.'}`
            ].join('\n');
        }).join('\n\n--- CANDIDATE ---\n');
        try {
            const completion = await generateSchedulerText([
                { role: 'system', content: `You are the neutral scheduler AI for isolated Mafia match ${this.matchId}. Read every candidate's private thoughts, spoken message, priority rating, and turns-since-speaking count. Choose exactly one eligible PLAYER ID. Never rewrite or rate the messages yourself in the output; the ratings belong to the players. Return JSON only: {"playerId":number,"reason":"one short selection reason"}.` },
                { role: 'user', content: `${this.ledger()}\nLAST PUBLIC TURN: ${lastPublicTurn ? `${lastPublicTurn.name}: ${lastPublicTurn.message}` : 'There is no previous public turn.'}\n\nSELECTION CRITERIA, IN ORDER:\n1. High priority rating: prefer a message the player rated as urgent.\n2. Relevance or response: prefer a message that directly answers, challenges, or responds to the last turn's question or accusation.\n3. Quiet-player fairness: prefer a player who has not spoken for the last 3 turns.\n4. New evidence: prefer a message that introduces a concrete new fact, contradiction, vote, reveal, or useful question instead of repeating the table.\n5. Strategic timing: prefer a role-appropriate message that is especially useful in this phase right now.\n6. Tiebreaker: if candidates remain tied, choose the one with the larger turns-since-speaking count; if still tied, choose consistently using the match/turn nonce.\nUse the criteria in that order, while respecting the no-back-to-back rule when another eligible player is available.\n\nCANDIDATES:\n${candidateBrief}` }
            ], this.settings);
            const result = this.parseObject(completion.content);
            return scored.find(entry => Number(result.playerId) === entry.player.id) || null;
        } catch { return null; }
    }

    async chooseWithScheduler(scored) {
        if (!scored.length) return null;
        // The scheduler sees every candidate, not only neglected players, so
        // it can compare urgency, relevance, new evidence, and fairness.
        return this.schedulerInjection(scored);
    }

    fallbackSpeakerScore(entry) {
        const packet = entry.packet || {};
        const message = String(packet.message || '').toLowerCase();
        const previous = this.currentDiscussionLog[this.currentDiscussionLog.length - 1];
        const previousMessage = String(previous?.message || '').toLowerCase();
        const quietTurns = this.turnsSinceSpoke[entry.player.id] || 0;
        const relevance = previous && previous.id !== entry.player.id
            ? (/[?]|\b(why|how|explain|answer|respond|your claim|you said|accus|blame)\b/.test(previousMessage) &&
                /\b(because|answer|respond|explain|my claim|i said|that is why|you asked|the reason)\b/.test(message) ? 3 : 0)
            : 0;
        const newEvidence = /\b(evidence|vote|voted|result|investigat|reveal|contradict|proof|question|specific|record)\b/.test(message) ? 2 : 0;
        const strategicTiming = entry.player.role && entry.player.role !== this.roles.CITIZEN ? 1 : 0;
        // This mirrors the scheduler rubric if its optional AI credentials
        // are unavailable: urgency first, then relevance, fairness, evidence,
        // and phase/role timing.
        return (Number(packet.priority) || 5) * 100 + relevance * 20 + (quietTurns >= 3 ? 15 : quietTurns * 3) + newEvidence * 10 + strategicTiming * 5;
    }

    async selectSpeaker() {
        const alive = this.alive().filter(player => player.id !== this.silencedPlayerId && !(this.silencedPlayerId === 'ALL_BOTS' && !player.isHuman));
        if (!alive.length) return null;
        const manual = alive.find(player => player.id === this.nextSpeakerId && player.id !== this.lastSpeakerId);
        this.nextSpeakerId = null;
        if (manual) { this.ui.clearPriorityVisuals(); return { player: manual, packet: manual.isHuman ? null : await this.askAgent(manual, this.currentPhase === 'day' ? 'day discussion' : 'discussion') }; }

        const eligible = alive.filter(player => player.id !== this.lastSpeakerId);
        const pool = eligible.length ? eligible : alive;
        const scored = await Promise.all(pool.map(async player => {
            if (player.isHuman) return { player, packet: null, score: 6 + Math.min(3, this.turnsSinceSpoke[player.id] || 0) };
            const packet = await this.askAgent(player, this.currentPhase === 'day' ? 'day discussion' : 'discussion');
            return { player, packet, score: this.fallbackSpeakerScore({ player, packet }) };
        }));
        scored.sort((a, b) => b.score - a.score);
        const scheduled = await this.chooseWithScheduler(scored);
        return scheduled || scored[0] || null;
    }

    setupTrollHandlers() {
        if (!this.ui.trollBtns) return;
        this.ui.trollBtns.forceVote?.addEventListener('click', async () => {
            const targetId = await this.ui.getTrollChoice('EXECUTE WHO?', this.alive().map(player => ({ label: player.name, value: player.id })));
            if (targetId !== null) this.trollVoteVictim = this.players.find(player => player.id === targetId) || null;
        });
        this.ui.trollBtns.killRandom?.addEventListener('click', async () => {
            const targetId = await this.ui.getTrollChoice('KILL WHO?', this.alive().map(player => ({ label: player.name, value: player.id })));
            const target = this.players.find(player => player.id === targetId);
            if (target) await this.eliminatePlayer(target, 'TROLL EXECUTED');
        });
        this.ui.trollBtns.revealRoles?.addEventListener('click', () => {
            this.ui.areRolesRevealed = true;
            this.ui.renderPlayerList(this.players);
            setTimeout(() => { this.ui.areRolesRevealed = false; this.ui.renderPlayerList(this.players); }, 5000);
        });
        this.ui.trollBtns.silenceAll?.addEventListener('click', () => { this.silencedPlayerId = 'ALL_BOTS'; });
        this.ui.trollBtns.reviveAll?.addEventListener('click', () => {
            this.players.forEach(player => { player.alive = true; this.update3DLabel(player, player.name, null); });
            this.ui.renderPlayerList(this.players);
        });
        this.ui.trollBtns.skipPhase?.addEventListener('click', () => { this.phaseSkipTriggered = true; });
        this.ui.trollBtns.forceSpeech?.addEventListener('click', async () => {
            const targetId = await this.ui.getTrollChoice('FORCE WHO TO TALK?', this.alive().filter(player => !player.isHuman).map(player => ({ label: player.name, value: player.id })));
            const target = this.players.find(player => player.id === targetId);
            if (target) {
                const speech = await this.ui.getUserInput(`What should ${target.name} say?`);
                if (speech && this.currentPhase === 'day') {
                    this.ui.showDialogue(target, speech);
                    const entry = { name: target.name, id: target.id, message: speech, phase: this.currentPhase, day: this.dayCount };
                    this.publicHistory.push(entry);
                    this.currentDiscussionLog.push(entry);
                }
            }
        });
    }

    async start() {
        this.resetMatchState();
        this.matchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        this.players.forEach(player => {
            player.alive = true;
            player.role = null;
            player.isHuman = Boolean(player.isHuman);
            this.turnsSinceSpoke[player.id] = 0;
        });
        try {
            this.ui.showLoading('Building a fresh match ledger...');
            for (let progress = 0; progress <= 100; progress += 10) {
                this.ui.updateLoading(progress, progress < 100 ? 'Preparing the table...' : 'Match ready');
                await this.sleep(45);
            }
            this.ui.hideLoading();
            if (this.settings.recordGame) {
                const canvas = document.querySelector('canvas');
                if (canvas) this.ui.startRecording(canvas, this.audio.getStream());
            }
            this.assignRoles();
            this.players.forEach(player => this.update3DLabel(player, player.name, this.settings.hideRoles ? null : (player.isHuman ? null : player.role)));
            this.ui.renderPlayerList(this.players);
            const human = this.players.find(player => player.isHuman);
            if (human) await this.ui.showAnnouncement('YOU ARE', human.role, 2500);
            this.currentPhase = 'night';
            while (this.gameActive && !this.forceStop) {
                await this.runNightPhase();
                if (!this.gameActive || this.checkWinCondition()) break;
                await this.runDayPhase();
                if (this.checkWinCondition()) break;
            }
            if (this.achievements && !this.forceStop) this.achievements.unlock('ending');
        } catch (error) {
            if (error?.message !== 'GameStopped') console.error(error);
        } finally {
            this.ui.hidePrivateThought();
            this.ui.hideDialogue();
            this.ui.setPhaseTimer(null);
        }
    }

    assignRoles() {
        const shuffled = this.players.slice().sort(() => Math.random() - 0.5);
        const forced = this.settings.playWithThem && this.settings.userRole && this.settings.userRole !== 'RANDOM' ? this.settings.userRole : null;
        shuffled.forEach(player => {
            player.role = null;
            player.alive = true;
            player.vigilanteUsed = false;
            player.vigilanteTargetId = null;
        });
        const takeRole = (role, preferred = null) => {
            const player = preferred || shuffled.find(candidate => !candidate.role);
            if (player) player.role = this.roles[role];
        };
        const human = this.players.find(player => player.isHuman);
        if (forced && human) takeRole(forced, human);
        const cfg = this.settings.roleSettings || {};
        if (!shuffled.some(player => player.role === this.roles.MAFIA)) takeRole('MAFIA');
        if (!shuffled.some(player => player.role === this.roles.SHERIFF) && cfg.SHERIFF?.enabled !== false) takeRole('SHERIFF');
        if (!shuffled.some(player => player.role === this.roles.HEALER) && cfg.HEALER?.enabled !== false) takeRole('HEALER');
        if (!shuffled.some(player => player.role === this.roles.VIGILANTE) && cfg.VIGILANTE?.enabled !== false) takeRole('VIGILANTE');
        const mafiaMax = Math.max(1, Math.min(4, Number(cfg.MAFIA?.max) || Math.ceil(this.players.length / 5)));
        while (shuffled.filter(player => player.role === this.roles.MAFIA).length < mafiaMax && shuffled.some(player => !player.role)) takeRole('MAFIA');
        shuffled.forEach(player => { if (!player.role) player.role = this.roles.CITIZEN; });
        this.vigilanteUsed = false;
    }

    async runNightPhase() {
        this.currentPhase = 'night';
        this.dayCount += 1;
        this.currentDiscussionLog = [];
        this.mafiaTargetId = null;
        this.nightDoctorSaveId = null;
        this.nightVigilanteTargetId = null;
        this.players.forEach(player => { player.vigilanteTargetId = null; });
        this.silencedPlayerId = null;
        this.environment.setNight();
        this.audio.playBGM('night');
        this.audio.playSFX('night_transition', 0.8);
        this.ui.updateStatus(`Night ${this.dayCount}: Mafia phase`);
        await this.sleep(900);

        await this.runMafiaPhase();
        if (!this.gameActive) return;
        await this.runDoctorPhase();
        await this.runSheriffPhase();
        await this.runVigilantePhase();
        await this.resolveNight();
    }

    async runMafiaPhase() {
        const mafia = this.mafia();
        if (!mafia.length) return;
        const candidates = this.alive().filter(player => !this.isEvil(player));
        this.ui.updateStatus(`Night ${this.dayCount}: Mafia discussion`);
        for (const player of mafia) {
            if (this.phaseSkipTriggered) { this.phaseSkipTriggered = false; break; }
            if (player.isHuman) {
                const text = await this.ui.getUserInput('Mafia discussion: say your plan');
                await this.showTurn(player, { thoughts: 'Private mafia planning.', message: text, priority: 5 }, null, 'mafia');
            } else {
                // The AI chooses its intended victim while writing this
                // discussion line. The same target is reused by the later
                // Mafia vote, so the visible order stays discussion -> vote
                // without allowing a second model decision to drift.
                const packet = await this.askActionTurn(player, 'Mafia kill vote', candidates, `Discuss living non-Mafia targets and Mafia strategy: keeping a low profile, redirecting suspicion, or accusing someone using real public evidence. Do not reveal the Mafia team in the spoken message.`, 'mafia');
                await this.showTurn(player, packet, null, 'mafia');
                player.nightActionPacket = packet;
            }
        }
        this.ui.updateStatus(`Night ${this.dayCount}: Mafia vote`);
        const votes = new Map();
        for (const player of mafia.filter(candidate => candidate.alive)) {
            let target;
            if (player.isHuman) {
                const choice = await this.ui.getUserAction('Mafia: choose a victim', candidates.map(candidate => ({ label: candidate.name, value: candidate.id })));
                target = candidates.find(candidate => candidate.id === choice);
            } else target = player.nightActionPacket?.target || this.pickRandomCandidate(candidates);
            if (target) votes.set(target.id, (votes.get(target.id) || 0) + 1);
            if (target) this.ui.showSpeechBubble(player, `Kill vote: ${target.name}`);
            await this.sleep(450);
        }
        this.players.forEach(player => { delete player.nightActionPacket; });
        this.mafiaTargetId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const target = this.players.find(player => player.id === this.mafiaTargetId);
        if (target) await this.ui.showAnnouncement('MAFIA TARGET', `${target.name} has been marked for the night.`, 1200);
    }

    async runDoctorPhase() {
        const doctor = this.alive().find(player => player.role === this.roles.HEALER);
        if (!doctor) return;
        this.ui.updateStatus(`Night ${this.dayCount}: Doctor phase`);
        let packet;
        if (doctor.isHuman) {
            const text = await this.ui.getUserInput('Doctor discussion: who might need saving?');
            packet = { thoughts: 'Private doctor strategy.', message: text, priority: 5 };
        } else packet = await this.askActionTurn(doctor, 'Doctor save', this.alive().filter(player => player.id !== this.lastDoctorSaveId), 'The Doctor may save any living player, including themself, but cannot save the same person saved on the immediately previous night.', 'doctor');
        await this.showTurn(doctor, packet, null, 'doctor');
        const candidates = this.alive().filter(player => player.id !== this.lastDoctorSaveId);
        let target;
        if (doctor.isHuman) {
            const choice = await this.ui.getUserAction('Doctor: choose someone to save', candidates.map(candidate => ({ label: candidate.name, value: candidate.id })));
            target = candidates.find(candidate => candidate.id === choice);
        } else target = packet.target || this.pickRandomCandidate(candidates);
        // The Doctor is never harmed by using the ability. Only the chosen
        // living player is recorded, and that player cannot be chosen again
        // on the immediately following night.
        this.nightDoctorSaveId = target?.id ?? null;
        this.lastDoctorSaveId = this.nightDoctorSaveId;
        if (target) this.ui.showSpeechBubble(doctor, `Save: ${target.name}`);
    }

    async runSheriffPhase() {
        const sheriff = this.alive().find(player => player.role === this.roles.SHERIFF);
        if (!sheriff) return;
        this.ui.updateStatus(`Night ${this.dayCount}: Sheriff phase`);
        let packet;
        if (sheriff.isHuman) {
            const text = await this.ui.getUserInput('Sheriff discussion: who should be investigated?');
            packet = { thoughts: 'Private sheriff strategy.', message: text, priority: 5 };
        } else packet = await this.askActionTurn(sheriff, 'Sheriff investigation', this.alive().filter(player => player.id !== sheriff.id), 'Investigate one living player. Name that player and explain which public statement, vote, reveal, or night result makes them worth checking.', 'sheriff');
        await this.showTurn(sheriff, packet, null, 'sheriff');
        const candidates = this.alive().filter(player => player.id !== sheriff.id);
        let target;
        if (sheriff.isHuman) {
            const choice = await this.ui.getUserAction('Sheriff: choose someone to investigate', candidates.map(candidate => ({ label: candidate.name, value: candidate.id })));
            target = candidates.find(candidate => candidate.id === choice);
        } else target = packet.target || this.pickRandomCandidate(candidates);
        if (target) {
            const result = this.isEvil(target) ? 'mafia' : 'not mafia';
            this.ui.showDialogue(sheriff, `${target.name} ${result}!`);
            await this.activeMessageWait(1500);
            this.ui.hideDialogue();
            this.privateIntel.sheriff.push({
                day: this.dayCount,
                targetId: target.id,
                targetName: target.name,
                result
            });
        }
    }

    async runVigilantePhase() {
        const vigilante = this.alive().find(player => player.role === this.roles.VIGILANTE);
        if (!vigilante || this.vigilanteUsed) return;
        this.ui.updateStatus(`Night ${this.dayCount}: Vigilante phase`);
        let packet;
        if (vigilante.isHuman) {
            const text = await this.ui.getUserInput('Vigilante discussion: use your one shot or hold it?');
            packet = { thoughts: 'Private vigilante strategy.', message: text, priority: 5 };
        } else packet = await this.askActionTurn(vigilante, 'Vigilante shot', this.alive().filter(player => player.id !== vigilante.id), 'The Vigilante is innocent and has exactly one lifetime shot. Choose a living player only when the public evidence supports it; otherwise choose SKIP and say why.', 'vigilante', true);
        await this.showTurn(vigilante, packet, null, 'vigilante');
        const candidates = this.alive().filter(player => player.id !== vigilante.id);
        let target = null;
        if (vigilante.isHuman) {
            const options = candidates.map(candidate => ({ label: candidate.name, value: candidate.id }));
            options.push({ label: 'Hold shot', value: 'SKIP', isSkip: true });
            const choice = await this.ui.getUserAction('Vigilante: use your one shot?', options);
            target = candidates.find(candidate => candidate.id === choice) || null;
        } else {
            // The action target was selected while generating the discussion;
            // never ask a second model call that could contradict it.
            target = packet.target || null;
        }
        // Holding fire keeps the one lifetime shot available. A shot is only
        // consumed when a real target is selected.
        this.nightVigilanteTargetId = target?.id ?? null;
        vigilante.vigilanteTargetId = this.nightVigilanteTargetId;
        if (target) this.vigilanteUsed = true;
        vigilante.vigilanteUsed = this.vigilanteUsed;
        if (target) this.ui.showSpeechBubble(vigilante, `Shot: ${target.name}`);
        else await this.ui.showAnnouncement('VIGILANTE HOLDS FIRE', 'The one shot remains available.', 1200);
    }

    async resolveNight() {
        this.ui.updateStatus(`Night ${this.dayCount}: Dawn is approaching`);
        const killed = [];
        const mafiaVictim = this.players.find(player => player.id === this.mafiaTargetId && player.alive);
        const doctorSaveId = this.nightDoctorSaveId;
        if (mafiaVictim && mafiaVictim.id !== doctorSaveId) killed.push({ player: mafiaVictim, reason: 'MAFIA KILL' });
        const vigilanteVictim = this.players.find(player => player.id === this.nightVigilanteTargetId && player.alive);
        if (vigilanteVictim && !killed.some(entry => entry.player.id === vigilanteVictim.id)) killed.push({ player: vigilanteVictim, reason: 'VIGILANTE SHOT' });
        if (doctorSaveId) {
            const doctor = this.players.find(player => player.role === this.roles.HEALER);
            const savedPlayer = this.players.find(player => player.id === doctorSaveId);
            if (doctor && savedPlayer) this.privateIntel.doctor.push({
                day: this.dayCount,
                targetId: savedPlayer.id,
                targetName: savedPlayer.name,
                success: mafiaVictim?.id === doctorSaveId
            });
        }
        for (const entry of killed) await this.eliminatePlayer(entry.player, entry.reason);
        this.lastNightEvents = killed.length ? killed.map(entry => `${entry.player.name} was eliminated`).join('; ') : 'No one was eliminated.';
        await this.sleep(700);
    }

    async runDayPhase() {
        this.currentPhase = 'day';
        this.currentDiscussionLog = [];
        this.environment.setDay();
        this.audio.playBGM('day');
        this.audio.playSFX('day_transition', 0.8);
        this.ui.updateStatus(`Day ${this.dayCount}: Discussion`);
        await this.ui.showAnnouncement(`DAY ${this.dayCount}`, this.lastNightEvents, 1800);
        if (this.settings.chaosMode) await this.runChaosDiscussion();
        else await this.runDayDiscussion();
        await this.runVoting();
    }

    async runDayDiscussion() {
        const state = { ms: 240000 };
        this.ui.setPhaseTimer(240);
        while (state.ms > 0 && this.alive().length > 1 && !this.phaseSkipTriggered) {
            const selected = await this.selectSpeaker();
            if (!selected) break;
            if (selected.player.isHuman) {
                const text = await this.ui.getUserInput('Your turn: make a point to the table');
                await this.showTurn(selected.player, { thoughts: '', message: text, priority: 5 }, state);
            } else await this.showTurn(selected.player, selected.packet, state);
            this.ui.updateStatus(`Day ${this.dayCount}: Discussion`);
        }
        this.phaseSkipTriggered = false;
        this.ui.setPhaseTimer(null);
        this.ui.hideDialogue();
    }

    async runChaosDiscussion() {
        const players = this.alive().filter(player => !player.isHuman);
        const packets = await Promise.all(players.map(player => this.askAgent(player, 'chaos discussion', 'Keep this line short and reactive; everyone is speaking in a noisy room.')));
        const state = { ms: 240000 };
        this.ui.setPhaseTimer(240);
        for (let i = 0; i < packets.length; i++) {
            if (state.ms <= 0 || this.phaseSkipTriggered) break;
            await this.showThought(players[i], packets[i].thoughts, state);
            const message = this.guardSheriffDisclosure(players[i], packets[i].message, true);
            this.ui.showDialogue(players[i], message);
            await this.activeMessageWait(Math.min(1200, state.ms), state);
            const entry = { name: players[i].name, id: players[i].id, message, thoughts: packets[i].thoughts || '', phase: this.currentPhase, day: this.dayCount };
            this.publicHistory.push(entry);
            this.currentDiscussionLog.push(entry);
            this.turnNumber++;
            this.lastSpeakerId = players[i].id;
            this.turnsSinceSpoke = Object.fromEntries(this.alive().map(candidate => [candidate.id, (this.turnsSinceSpoke[candidate.id] || 0) + 1]));
            this.turnsSinceSpoke[players[i].id] = 0;
        }
        this.phaseSkipTriggered = false;
        this.ui.setPhaseTimer(null);
        this.ui.hideDialogue();
    }

    async getVotePacket(voter, candidates) {
        if (voter.isHuman) return null;
        return this.askActionTurn(voter, 'public hammer vote', candidates, `End with a clear vote idea. Use the public discussion archive and previous vote rounds. ${this.settings.disableAbstaining ? 'Abstaining is disabled.' : 'You may choose SKIP only if abstaining is allowed.'}`, 'public', !this.settings.disableAbstaining);
    }

    async selectVoteVoter(voters, lastVoter) {
        const eligible = voters.filter(voter => !voter.hasVoted && voter.id !== lastVoter);
        const pool = eligible.length ? eligible : voters.filter(voter => !voter.hasVoted);
        if (!pool.length) return null;
        // Day voting needs to hand control to the human immediately. Do not
        // wait for the scheduler or any bot generation before showing the
        // target buttons.
        const human = pool.find(voter => voter.isHuman);
        if (human) return { voter: human, packet: null, score: 6 };
        // Pick the voter before generating any bot vote. Generating every
        // vote while selecting the queue can block the human action prompt.
        const scored = pool.map(voter => ({
            voter,
            packet: null,
            score: (voter.isHuman ? 6 : 5) + Math.min(4, this.turnsSinceSpoke[voter.id] || 0) + Math.random() * 0.1
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored[0] || null;
    }

    async runVoting() {
        const voters = this.alive().slice();
        const votes = new Map();
        this.liveVoteState = { submittedCount: 0, totalEligible: voters.length, records: [], tally: {} };
        this.ui.updateStatus(`Day ${this.dayCount}: Voting — choose who to hammer`);
        let lastVoter = null;
        while (voters.some(voter => !voter.hasVoted)) {
            const selected = await this.selectVoteVoter(voters, lastVoter);
            const voter = selected?.voter;
            if (!voter) break;
            let target = null;
            if (voter.isHuman) {
                const options = voters.filter(candidate => candidate.id !== voter.id).map(candidate => ({ label: candidate.name, value: candidate.id }));
                if (!this.settings.disableAbstaining) options.push({ label: 'Abstain', value: 'SKIP', isSkip: true });
                this.ui.hideDialogue();
                const choice = await this.ui.getUserAction('Who should be hammered?', options);
                target = voters.find(candidate => candidate.id === choice) || null;
            } else {
                const packet = await this.getVotePacket(voter, voters.filter(candidate => candidate.id !== voter.id));
                await this.showTurn(voter, packet);
                target = packet.target;
            }
            voter.hasVoted = true;
            lastVoter = voter.id;
            const record = { voter: voter.name, target: target?.name || null };
            this.liveVoteState.records.push(record);
            this.liveVoteState.submittedCount = this.liveVoteState.records.length;
            if (target) {
                votes.set(target.id, (votes.get(target.id) || 0) + 1);
                this.liveVoteState.tally[target.name] = votes.get(target.id);
                this.ui.showSpeechBubble(voter, `Hammer vote: ${target.name}`);
                this.ui.updateVoteBadge(target, votes.get(target.id));
            } else this.ui.showSpeechBubble(voter, 'Abstain');
            if (voter.isHuman) await this.activeMessageWait(900);
            else await this.activeMessageWait(500);
        }
        voters.forEach(voter => { delete voter.hasVoted; });
        const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        const tied = top && sorted[1] && sorted[1][1] === top[1];
        const victim = this.trollVoteVictim || (!tied && top ? this.players.find(player => player.id === top[0]) : null);
        this.trollVoteVictim = null;
        const result = victim ? `${victim.name} hammered` : (tied ? 'tie' : 'abstained');
        this.voteHistory.push({ day: this.dayCount, records: this.liveVoteState.records.slice(), result });
        this.liveVoteState = null;
        this.ui.hideAllVoteBadges();
        if (!victim) {
            await this.ui.showAnnouncement('NO HAMMER', tied ? 'The vote tied. No one is eliminated.' : 'The table abstained.', 1600);
            return;
        }
        await this.eliminatePlayer(victim, 'VOTED OUT');
    }

    checkWinCondition() {
        const aliveMafia = this.mafia().length;
        const aliveGood = this.good().length;
        if (aliveMafia === 0) {
            this.gameActive = false;
            this.ui.updateStatus('INNOCENTS WIN');
            this.ui.showAnnouncement('INNOCENTS WIN', 'Every Mafia player has been hammered.', 4200);
            this.ui.stopRecording();
            return true;
        }
        if (aliveMafia >= aliveGood) {
            this.gameActive = false;
            this.ui.updateStatus('MAFIA WINS');
            this.ui.showAnnouncement('MAFIA WINS', 'The Mafia now controls the table.', 4200);
            this.ui.stopRecording();
            return true;
        }
        return false;
    }

    async eliminatePlayer(player, reason) {
        if (!player || !player.alive) return;
        player.alive = false;
        this.revealedInfo.push({ name: player.name, role: player.role });
        this.update3DLabel(player, player.name, player.role);
        if (player.avatarGroup) player.avatarGroup.traverse(child => { if (child.material?.color) child.material.color.setHex(0x555555); });
        this.ui.renderPlayerList(this.players);
        await this.ui.showAnnouncement(`${player.name.toUpperCase()} WAS ELIMINATED`, `${reason}. They were the ${player.role}.`, 2300);
    }

    update3DLabel(player, nameText, roleText = null) {
        if (!player.avatarGroup) return;
        const nameSprite = player.avatarGroup.children.find(child => child.name === 'nameLabel');
        const roleSprite = player.avatarGroup.children.find(child => child.name === 'roleLabel');
        if (nameSprite) {
            const color = `#${(player.color || 0xffffff).toString(16).padStart(6, '0')}`;
            if (nameSprite.material.map) nameSprite.material.map.dispose();
            nameSprite.material.map = createLabelTexture(nameText, color, true);
            nameSprite.material.needsUpdate = true;
        }
        if (roleSprite) {
            roleSprite.visible = Boolean(roleText);
            if (roleText) {
                const color = this.isEvil({ role: roleText }) ? '#ff4444' : '#55aaff';
                if (roleSprite.material.map) roleSprite.material.map.dispose();
                roleSprite.material.map = createLabelTexture(roleText, color, false, 65);
                roleSprite.material.needsUpdate = true;
            }
        }
    }

    stop() {
        this.gameActive = false;
        this.forceStop = true;
        this.ui.cancelInputs();
        this.audio.stopAmbience();
    }

    reset() {
        this.stop();
        this.resetMatchState();
        this.players.forEach(player => {
            player.alive = true;
            player.role = null;
            player.isHuman = false;
            if (player.originalName) player.name = player.originalName;
            if (player.originalMap && player.avatarGroup?.children[0]) player.avatarGroup.children[0].material.map = player.originalMap;
            player.avatarGroup?.traverse(child => { if (child.material?.color) child.material.color.setHex(0xffffff); });
            this.update3DLabel(player, player.name, null);
        });
        this.ui.setPhaseTimer(null);
        this.ui.renderPlayerList(this.players);
    }
}
