import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.VOTECHAIN_DB || join(DATA_DIR, 'votechain.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY,
      proposer TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      quorum_tokens REAL NOT NULL,
      total_tokens_committed REAL NOT NULL DEFAULT 0,
      for_weight REAL NOT NULL DEFAULT 0,
      against_weight REAL NOT NULL DEFAULT 0,
      abstain_weight REAL NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('ACTIVE', 'SUCCEEDED', 'DEFEATED', 'EXECUTED')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ballots (
      id TEXT PRIMARY KEY,
      proposal_id INTEGER NOT NULL,
      voter TEXT NOT NULL,
      support INTEGER NOT NULL CHECK(support IN (0, 1, 2)),
      tokens_committed REAL NOT NULL,
      quadratic_weight REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
      UNIQUE(proposal_id, voter)
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM proposals;').get();
  if (countRow.c === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const seedProposals = [
    {
      id: 1,
      proposer: '0x1111222233334444555566667777888899990000',
      title: 'AIP-42: Deploy Quadratic Treasury Funding Round',
      description: 'Allocate 250,000 $VOTE tokens from DAO reserves to community open-source development grants via quadratic matching.',
      category: 'Treasury & Grants',
      quorum_tokens: 50000.0,
      total_tokens_committed: 65000.0,
      for_weight: 420.5,
      against_weight: 85.0,
      abstain_weight: 20.0,
      state: 'ACTIVE',
      start_time: new Date(Date.now() - 86400000 * 2).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 5).toISOString()
    },
    {
      id: 2,
      proposer: '0x3333444455556666777788889999000011112222',
      title: 'AIP-43: Activate Layer 2 Zero-Knowledge Rollup Settlement',
      description: 'Transition protocol state commitment roots from Ethereum L1 mainnet to Arbitrum Nitro rollup for 95% gas fee reduction.',
      category: 'Protocol Upgrade',
      quorum_tokens: 100000.0,
      total_tokens_committed: 120000.0,
      for_weight: 580.0,
      against_weight: 120.0,
      abstain_weight: 40.0,
      state: 'EXECUTED',
      start_time: new Date(Date.now() - 86400000 * 10).toISOString(),
      end_time: new Date(Date.now() - 86400000 * 3).toISOString()
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO proposals (id, proposer, title, description, category, quorum_tokens, total_tokens_committed, for_weight, against_weight, abstain_weight, state, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (const p of seedProposals) {
    stmt.run(p.id, p.proposer, p.title, p.description, p.category, p.quorum_tokens, p.total_tokens_committed, p.for_weight, p.against_weight, p.abstain_weight, p.state, p.start_time, p.end_time);
  }

  // Seed sample ballot
  db.prepare(`
    INSERT INTO ballots (id, proposal_id, voter, support, tokens_committed, quadratic_weight, tx_hash)
    VALUES ('bal-1', 1, '0x2222222222222222222222222222222222222222', 1, 10000.0, 100.0, '0x8888888888888888888888888888888888888888888888888888888888888888');
  `).run();
}

initDb();
