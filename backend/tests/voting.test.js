import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db.js';
import { voteChainManager } from '../src/engine/voting.js';

describe('VoteChain On-Chain Governance & Quadratic Voting Tests', () => {
  before(() => {
    initDb();
    // Test isolation cleanup
    db.exec("DELETE FROM ballots WHERE proposal_id > 2;");
    db.exec("DELETE FROM proposals WHERE id > 2;");
  });

  const proposer = '0x1111222233334444555566667777888899990000';
  const voter1 = '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555';
  const voter2 = '0xbbbb2222cccc3333dddd4444eeee5555ffff6666';

  test('Database seeds initial governance proposals and ballots', () => {
    const proposals = voteChainManager.listProposals();
    assert.ok(proposals.length >= 2, 'Should seed at least 2 governance proposals');

    const p1 = voteChainManager.getProposalDetails(1);
    assert.ok(p1);
    assert.equal(p1.quorum_tokens, 50000.0);
    assert.ok(p1.ballots.length >= 1);
  });

  test('Quadratic weight algorithm dampens plutocratic voting power', () => {
    // 100 tokens -> sqrt = 10 votes
    assert.equal(voteChainManager.calculateQuadraticWeight(100), 10.0);

    // 10,000 tokens (100x tokens) -> sqrt = 100 votes (only 10x voting weight)
    assert.equal(voteChainManager.calculateQuadraticWeight(10000), 100.0);

    // 1,000,000 tokens (10,000x tokens) -> sqrt = 1,000 votes (only 100x weight)
    assert.equal(voteChainManager.calculateQuadraticWeight(1000000), 1000.0);
  });

  test('createProposal initializes new active voting issue', () => {
    const prop = voteChainManager.createProposal({
      proposer,
      title: 'AIP-99: Deploy Community Liquidity Staking Pool',
      description: 'Seed decentralized AMM liquidity for $VOTE with 15% APY protocol emissions.',
      category: 'DeFi & Liquidity',
      quorumTokens: 40000.0,
      durationDays: 7
    });

    assert.ok(prop.id);
    assert.equal(prop.state, 'ACTIVE');
    assert.equal(prop.quorum_tokens, 40000.0);
    assert.equal(prop.total_tokens_committed, 0);
  });

  test('castVote registers ballot with quadratic weight and prevents duplicates', () => {
    const list = voteChainManager.listProposals();
    const testProp = list.find(p => p.title === 'AIP-99: Deploy Community Liquidity Staking Pool');
    assert.ok(testProp);

    // Voter 1 casts 2,500 tokens FOR (support = 1) -> weight = sqrt(2500) = 50
    const b1 = voteChainManager.castVote({
      proposalId: testProp.id,
      voter: voter1,
      support: 1,
      tokensCommitted: 2500.0
    });

    assert.equal(b1.quadraticWeight, 50.0);
    assert.equal(b1.support, 1);
    assert.ok(b1.txHash.startsWith('0x'));

    // Duplicate ballot by same voter throws
    assert.throws(() => {
      voteChainManager.castVote({
        proposalId: testProp.id,
        voter: voter1,
        support: 1,
        tokensCommitted: 100.0
      });
    }, (err) => err.message.includes('Duplicate ballot'));

    // Voter 2 casts 900 tokens AGAINST (support = 0) -> weight = sqrt(900) = 30
    const b2 = voteChainManager.castVote({
      proposalId: testProp.id,
      voter: voter2,
      support: 0,
      tokensCommitted: 900.0
    });

    assert.equal(b2.quadraticWeight, 30.0);

    const updated = voteChainManager.getProposalDetails(testProp.id);
    assert.equal(updated.for_weight, 50.0);
    assert.equal(updated.against_weight, 30.0);
    assert.equal(updated.total_tokens_committed, 3400.0);
  });

  test('executeProposal enforces quorum threshold and majority outcome', () => {
    const list = voteChainManager.listProposals();
    const testProp = list.find(p => p.title === 'AIP-99: Deploy Community Liquidity Staking Pool');

    // Quorum is 40,000, committed is 3,400 -> Quorum not met -> DEFEATED
    const execDefeated = voteChainManager.executeProposal(testProp.id);
    assert.equal(execDefeated.finalState, 'DEFEATED');
    assert.equal(execDefeated.quorumMet, false);
  });
});
