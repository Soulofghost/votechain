import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { voteChainManager } from './engine/voting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(join(__dirname, '../../frontend')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VoteChain',
    version: '1.0.0',
    govToken: config.govTokenSymbol,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = voteChainManager.getGovernanceStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/proposals', (req, res) => {
  try {
    const status = req.query.status || 'ALL';
    const proposals = voteChainManager.listProposals(status);
    res.json({ total: proposals.length, proposals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/proposals/:id', (req, res) => {
  try {
    const proposal = voteChainManager.getProposalDetails(parseInt(req.params.id, 10));
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(proposal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proposals', (req, res) => {
  try {
    const { proposer, title, description, category, quorumTokens, durationDays } = req.body;
    const proposal = voteChainManager.createProposal({
      proposer,
      title,
      description,
      category,
      quorumTokens: parseFloat(quorumTokens),
      durationDays: parseInt(durationDays, 10)
    });
    res.status(201).json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/proposals/:id/vote', (req, res) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    const { voter, support, tokensCommitted } = req.body;
    const result = voteChainManager.castVote({
      proposalId,
      voter,
      support: parseInt(support, 10),
      tokensCommitted: parseFloat(tokensCommitted)
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/proposals/:id/execute', (req, res) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    const result = voteChainManager.executeProposal(proposalId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`VoteChain On-Chain Governance Gateway listening on port ${config.port}`);
  });
}

export default app;
