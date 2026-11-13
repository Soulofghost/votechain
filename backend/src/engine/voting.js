import { db } from '../db.js';
import crypto from 'node:crypto';

export class VoteChainManager {
  calculateQuadraticWeight(tokens) {
    if (tokens <= 0) return 0;
    return parseFloat(Math.sqrt(tokens).toFixed(2));
  }

  listProposals(stateFilter = null) {
    if (stateFilter && stateFilter !== 'ALL') {
      return db.prepare('SELECT * FROM proposals WHERE state = ? ORDER BY id DESC;').all(stateFilter);
    }
    return db.prepare('SELECT * FROM proposals ORDER BY id DESC;').all();
  }

  getProposalDetails(id) {
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?;').get(id);
    if (!proposal) return null;

    const ballots = db.prepare('SELECT * FROM ballots WHERE proposal_id = ? ORDER BY timestamp DESC;').all(id);
    const quorumMet = proposal.total_tokens_committed >= proposal.quorum_tokens;
    const quorumPercent = Math.min(100, Math.round((proposal.total_tokens_committed / proposal.quorum_tokens) * 100));

    const totalWeight = proposal.for_weight + proposal.against_weight + proposal.abstain_weight;
    const forPercent = totalWeight > 0 ? Math.round((proposal.for_weight / totalWeight) * 100) : 0;
    const againstPercent = totalWeight > 0 ? Math.round((proposal.against_weight / totalWeight) * 100) : 0;

    return {
      ...proposal,
      quorumMet,
      quorumPercent,
      totalWeight: parseFloat(totalWeight.toFixed(2)),
      forPercent,
      againstPercent,
      ballotCount: ballots.length,
      ballots
    };
  }

  createProposal({ proposer, title, description, category, quorumTokens, durationDays }) {
    if (!title || !description || quorumTokens <= 0 || durationDays <= 0) {
      throw new Error('Invalid proposal parameters: title, description, quorum > 0, duration > 0 required');
    }

    const cleanProposer = (proposer || '0x0000000000000000000000000000000000000000').toLowerCase();
    const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM proposals;').get();
    const newId = maxIdRow.nextId;

    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + durationDays * 86400000).toISOString();

    db.prepare(`
      INSERT INTO proposals (id, proposer, title, description, category, quorum_tokens, total_tokens_committed, for_weight, against_weight, abstain_weight, state, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'ACTIVE', ?, ?);
    `).run(newId, cleanProposer, title, description, category || 'Governance', quorumTokens, startTime, endTime);

    return this.getProposalDetails(newId);
  }

  castVote({ proposalId, voter, support, tokensCommitted }) {
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?;').get(proposalId);
    if (!proposal) throw new Error(`Proposal #${proposalId} not found`);

    if (proposal.state !== 'ACTIVE') {
      throw new Error(`Cannot vote: proposal is already ${proposal.state}`);
    }

    if (new Date(proposal.end_time).getTime() < Date.now()) {
      throw new Error('Voting window has closed for this proposal');
    }

    if (tokensCommitted <= 0) {
      throw new Error('Must commit at least 1 governance token to cast ballot');
    }

    const cleanVoter = voter.toLowerCase();
    const existing = db.prepare('SELECT COUNT(*) as c FROM ballots WHERE proposal_id = ? AND voter = ?;').get(proposalId, cleanVoter);
    if (existing.c > 0) {
      throw new Error(`Duplicate ballot: address ${cleanVoter} has already voted on Proposal #${proposalId}`);
    }

    const quadraticWeight = this.calculateQuadraticWeight(tokensCommitted);
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const ballotId = 'bal-' + crypto.randomBytes(8).toString('hex');

    db.prepare(`
      INSERT INTO ballots (id, proposal_id, voter, support, tokens_committed, quadratic_weight, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `).run(ballotId, proposalId, cleanVoter, support, tokensCommitted, quadraticWeight, txHash);

    // Update weights
    let forCol = 'for_weight';
    if (support === 0) forCol = 'against_weight';
    if (support === 2) forCol = 'abstain_weight';

    db.prepare(`
      UPDATE proposals
      SET total_tokens_committed = total_tokens_committed + ?,
          ${forCol} = ${forCol} + ?
      WHERE id = ?;
    `).run(tokensCommitted, quadraticWeight, proposalId);

    return {
      ballotId,
      proposalId,
      voter: cleanVoter,
      support,
      tokensCommitted,
      quadraticWeight,
      txHash,
      timestamp: new Date().toISOString()
    };
  }

  executeProposal(proposalId) {
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?;').get(proposalId);
    if (!proposal) throw new Error(`Proposal #${proposalId} not found`);

    if (proposal.state !== 'ACTIVE') {
      throw new Error(`Proposal is already ${proposal.state}`);
    }

    const quorumMet = proposal.total_tokens_committed >= proposal.quorum_tokens;
    let finalState = 'DEFEATED';

    if (quorumMet && proposal.for_weight > proposal.against_weight) {
      finalState = 'EXECUTED';
    } else {
      finalState = 'DEFEATED';
    }

    db.prepare('UPDATE proposals SET state = ? WHERE id = ?;').run(finalState, proposalId);

    return {
      proposalId,
      finalState,
      quorumMet,
      forWeight: proposal.for_weight,
      againstWeight: proposal.against_weight,
      message: finalState === 'EXECUTED' ? 'Proposal executed on-chain' : 'Proposal defeated'
    };
  }

  getGovernanceStats() {
    const totalProp = db.prepare('SELECT COUNT(*) as c FROM proposals;').get().c;
    const activeProp = db.prepare("SELECT COUNT(*) as c FROM proposals WHERE state = 'ACTIVE';").get().c;
    const totalBallots = db.prepare('SELECT COUNT(*) as c FROM ballots;').get().c;
    const totalTokens = db.prepare('SELECT COALESCE(SUM(total_tokens_committed), 0) as s FROM proposals;').get().s;

    return {
      totalProposals: totalProp,
      activeVotingProposals: activeProp,
      totalBallotsCast: totalBallots,
      governanceTokensCommitted: parseFloat(totalTokens.toFixed(2)),
      quadraticWeighting: 'Enforced (sqrt(T))'
    };
  }
}

export const voteChainManager = new VoteChainManager();
