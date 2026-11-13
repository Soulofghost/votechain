// VoteChain On-Chain Governance & Quadratic Voting Client
const API_BASE = window.location.origin.includes('http') && !window.location.origin.startsWith('file:')
  ? window.location.origin
  : 'http://localhost:4026';

let currentProposals = [];
let activeFilter = 'ALL';
let simulatedVoter = '0x3333333333333333333333333333333333333333';

document.addEventListener('DOMContentLoaded', () => {
  setupFilterTabs();
  setupCalculator();
  setupModals();
  loadStats();
  loadProposals();
});

function setupCalculator() {
  const tokenInput = document.getElementById('calcTokenInput');
  const weightOutput = document.getElementById('calcWeightOutput');

  tokenInput.addEventListener('input', () => {
    const val = parseFloat(tokenInput.value) || 0;
    const weight = Math.sqrt(Math.max(0, val));
    weightOutput.textContent = `${weight.toFixed(2)} votes`;
  });
}

function setupFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.status;
      renderProposals();
    });
  });
}

function setupModals() {
  const createModal = document.getElementById('createProposalModal');
  const voteModal = document.getElementById('voteModal');

  document.getElementById('openCreateProposalModal').addEventListener('click', () => {
    createModal.classList.add('active');
  });

  document.getElementById('closeCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });
  document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });

  document.getElementById('closeVoteBtn').addEventListener('click', () => {
    voteModal.classList.remove('active');
  });

  document.getElementById('createProposalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      proposer: simulatedVoter,
      title: document.getElementById('propTitle').value.trim(),
      category: document.getElementById('propCategory').value,
      quorumTokens: parseFloat(document.getElementById('propQuorum').value),
      durationDays: parseInt(document.getElementById('propDuration').value, 10),
      description: document.getElementById('propDesc').value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to submit proposal');
        return;
      }
      createModal.classList.remove('active');
      document.getElementById('createProposalForm').reset();
      loadProposals();
      loadStats();
    } catch (err) {
      alert('Error deploying proposal: ' + err.message);
    }
  });
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error('Stats status ' + res.status);
    const data = await res.json();
    document.getElementById('tokensCommitted').textContent = `${data.governanceTokensCommitted.toLocaleString()} $VOTE`;
    document.getElementById('activeProposals').textContent = `${data.activeVotingProposals} Live Vote${data.activeVotingProposals === 1 ? '' : 's'}`;
  } catch (err) {
    // Keep defaults
  }
}

async function loadProposals() {
  try {
    const res = await fetch(`${API_BASE}/api/proposals`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    currentProposals = data.proposals || [];
    renderProposals();
  } catch (err) {
    currentProposals = [
      {
        id: 1,
        title: 'AIP-42: Deploy Quadratic Treasury Funding Round',
        description: 'Allocate 250,000 $VOTE tokens from DAO reserves to community open-source development grants via quadratic matching.',
        category: 'Treasury & Grants',
        quorum_tokens: 50000.0,
        total_tokens_committed: 65000.0,
        for_weight: 420.5,
        against_weight: 85.0,
        abstain_weight: 20.0,
        state: 'ACTIVE',
        end_time: '2027-04-20T00:00:00Z'
      },
      {
        id: 2,
        title: 'AIP-43: Activate Layer 2 Zero-Knowledge Rollup Settlement',
        description: 'Transition protocol state commitment roots from Ethereum L1 mainnet to Arbitrum Nitro rollup for 95% gas fee reduction.',
        category: 'Protocol Upgrade',
        quorum_tokens: 100000.0,
        total_tokens_committed: 120000.0,
        for_weight: 580.0,
        against_weight: 120.0,
        abstain_weight: 40.0,
        state: 'EXECUTED',
        end_time: '2026-11-10T00:00:00Z'
      }
    ];
    renderProposals();
  }
}

function renderProposals() {
  const grid = document.getElementById('proposalsGrid');
  let filtered = currentProposals;

  if (activeFilter !== 'ALL') {
    filtered = filtered.filter(p => p.state === activeFilter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading-state">No governance proposals found in this view.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const totalW = p.for_weight + p.against_weight + p.abstain_weight;
    const forPct = totalW > 0 ? Math.round((p.for_weight / totalW) * 100) : 0;
    const againstPct = totalW > 0 ? Math.round((p.against_weight / totalW) * 100) : 0;
    const abstainPct = totalW > 0 ? Math.round((p.abstain_weight / totalW) * 100) : 0;

    const quorumPct = Math.min(100, Math.round((p.total_tokens_committed / p.quorum_tokens) * 100));

    return `
      <div class="proposal-card" onclick="openProposalDetail(${p.id})">
        <div class="card-top">
          <span class="category-tag">${escapeHtml(p.category)}</span>
          <span class="status-badge status-${p.state.toLowerCase()}">${escapeHtml(p.state)}</span>
        </div>
        <h3 class="prop-title">${escapeHtml(p.title)}</h3>
        <p class="prop-desc">${escapeHtml(p.description)}</p>

        <div class="vote-split-bar">
          <div class="split-for" style="width: ${forPct}%;"></div>
          <div class="split-against" style="width: ${againstPct}%;"></div>
          <div class="split-abstain" style="width: ${abstainPct}%;"></div>
        </div>

        <div class="vote-numbers">
          <span style="color: var(--accent-emerald);">FOR: ${forPct}% (${p.for_weight.toFixed(1)})</span>
          <span style="color: var(--accent-red);">AGAINST: ${againstPct}% (${p.against_weight.toFixed(1)})</span>
        </div>

        <div class="card-footer">
          <span>Quorum: <strong>${quorumPct}%</strong> (${p.total_tokens_committed.toLocaleString()} / ${p.quorum_tokens.toLocaleString()} $VOTE)</span>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openProposalDetail(${p.id})">Vote &rarr;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openProposalDetail = async function(id) {
  const modal = document.getElementById('voteModal');
  const content = document.getElementById('voteModalContent');
  const title = document.getElementById('voteModalTitle');

  content.innerHTML = '<div class="loading-state">Loading on-chain ballot ledger...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`${API_BASE}/api/proposals/${id}`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const p = await res.json();
    title.textContent = p.title;

    const ballots = p.ballots || [];
    const isVotingActive = p.state === 'ACTIVE' && new Date(p.end_time).getTime() > Date.now();

    content.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center;">
          <span class="category-tag">${escapeHtml(p.category)}</span>
          <span class="status-badge status-${p.state.toLowerCase()}">${escapeHtml(p.state)}</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">Ends: ${new Date(p.end_time).toLocaleDateString()}</span>
        </div>
        <p style="font-size: 0.95rem; color: var(--text-muted);">${escapeHtml(p.description)}</p>
      </div>

      <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; font-family: var(--font-mono); font-size: 0.85rem; text-align: center;">
          <div><span style="color: var(--accent-emerald); font-size: 1.25rem; font-weight: 700; display: block;">${p.for_weight.toFixed(1)}</span>WEIGHT FOR (${p.forPercent}%)</div>
          <div><span style="color: var(--accent-red); font-size: 1.25rem; font-weight: 700; display: block;">${p.against_weight.toFixed(1)}</span>WEIGHT AGAINST (${p.againstPercent}%)</div>
          <div><span style="color: var(--primary); font-size: 1.25rem; font-weight: 700; display: block;">${p.total_tokens_committed.toLocaleString()}</span>TOKENS COMMITTED</div>
        </div>
      </div>

      <!-- Voting Form (if active) -->
      ${isVotingActive ? `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: 12px; margin-bottom: 1.5rem;">
          <h4 style="margin-bottom: 1rem;">Cast Quadratic Ballot</h4>
          <div class="field-row">
            <div class="field" style="flex: 2;">
              <label>Tokens to Commit ($VOTE) *</label>
              <input type="number" id="castTokens" value="1000" min="1" step="10" oninput="updateCastPreview()">
            </div>
            <div class="field" style="flex: 1;">
              <label>Effective Vote Weight</label>
              <div id="castWeightPreview" style="padding: 0.75rem; font-family: var(--font-mono); font-weight: 700; color: var(--primary);">31.62 votes</div>
            </div>
          </div>
          <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" style="flex: 1; background: var(--accent-emerald);" onclick="submitBallot(${p.id}, 1)">Vote FOR</button>
            <button class="btn btn-primary" style="flex: 1; background: var(--accent-red);" onclick="submitBallot(${p.id}, 0)">Vote AGAINST</button>
            <button class="btn btn-secondary" style="flex: 1;" onclick="submitBallot(${p.id}, 2)">ABSTAIN</button>
          </div>
        </div>
      ` : ''}

      <!-- Historical Ballots -->
      <h4 style="margin-bottom: 0.75rem; font-size: 0.95rem;">Ballot Verification Audit Trail</h4>
      ${ballots.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No ballots cast yet on this proposal.</p>' : `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Voter</th>
              <th style="padding: 0.5rem;">Decision</th>
              <th style="padding: 0.5rem;">Committed</th>
              <th style="padding: 0.5rem;">Quad Weight</th>
              <th style="padding: 0.5rem;">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            ${ballots.map(b => {
              const label = b.support === 1 ? '<span style="color: var(--accent-emerald);">FOR</span>' : (b.support === 0 ? '<span style="color: var(--accent-red);">AGAINST</span>' : 'ABSTAIN');
              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-family: var(--font-mono);">
                  <td style="padding: 0.5rem;">${escapeHtml(b.voter.slice(0, 8))}...${escapeHtml(b.voter.slice(-4))}</td>
                  <td style="padding: 0.5rem; font-weight: 700;">${label}</td>
                  <td style="padding: 0.5rem;">${b.tokens_committed.toLocaleString()}</td>
                  <td style="padding: 0.5rem; color: var(--primary); font-weight: 700;">${b.quadratic_weight.toFixed(1)}</td>
                  <td style="padding: 0.5rem; color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(b.tx_hash.slice(0, 10))}...</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    `;
  } catch (err) {
    content.innerHTML = `<div class="loading-state" style="color: var(--accent-red);">${err.message}</div>`;
  }
};

window.updateCastPreview = function() {
  const input = document.getElementById('castTokens');
  const preview = document.getElementById('castWeightPreview');
  if (input && preview) {
    const val = parseFloat(input.value) || 0;
    preview.textContent = `${Math.sqrt(Math.max(0, val)).toFixed(2)} votes`;
  }
};

window.submitBallot = async function(proposalId, support) {
  const tokens = parseFloat(document.getElementById('castTokens').value) || 0;
  if (tokens <= 0) {
    alert('Must commit at least 1 token');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/proposals/${proposalId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voter: simulatedVoter,
        support,
        tokensCommitted: tokens
      })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Vote submission failed');
      return;
    }
    const data = await res.json();
    alert(`Ballot cast with quadratic weight ${data.quadraticWeight}! On-chain Tx: ${data.txHash}`);
    openProposalDetail(proposalId);
    loadProposals();
    loadStats();
  } catch (err) {
    alert('Error submitting ballot: ' + err.message);
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
