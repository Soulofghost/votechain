// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VoteChain - Transparent On-Chain Governance & Quadratic Voting Protocol
 * @notice Prevents plutocratic dominance via square-root quadratic vote weight calculation.
 */
contract VoteChain {
    enum ProposalState { PENDING, ACTIVE, DEFEATED, SUCCEEDED, EXECUTED }

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        uint256 startTime;
        uint256 endTime;
        uint256 quorumTokens;
        uint256 totalTokensCommitted;
        uint256 forVotesWeight;
        uint256 againstVotesWeight;
        uint256 abstainVotesWeight;
        ProposalState state;
        mapping(address => bool) hasVoted;
    }

    uint256 public proposalCounter;
    mapping(uint256 => Proposal) public proposals;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 quorumTokens);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 support, uint256 tokens, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, ProposalState finalState);

    function createProposal(
        string memory _title,
        string memory _description,
        uint256 _durationSeconds,
        uint256 _quorumTokens
    ) external returns (uint256) {
        require(_durationSeconds >= 1 hours, "Duration too short");
        require(_quorumTokens > 0, "Quorum must be positive");

        proposalCounter++;
        uint256 pId = proposalCounter;

        Proposal storage p = proposals[pId];
        p.id = pId;
        p.proposer = msg.sender;
        p.title = _title;
        p.description = _description;
        p.startTime = block.timestamp;
        p.endTime = block.timestamp + _durationSeconds;
        p.quorumTokens = _quorumTokens;
        p.state = ProposalState.ACTIVE;

        emit ProposalCreated(pId, msg.sender, _title, _quorumTokens);
        return pId;
    }

    // Babylon integer square-root algorithm for quadratic weight
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function castVote(uint256 _proposalId, uint8 _support, uint256 _tokensCommitted) external {
        Proposal storage p = proposals[_proposalId];
        require(p.id != 0, "Proposal does not exist");
        require(block.timestamp <= p.endTime, "Voting period ended");
        require(!p.hasVoted[msg.sender], "Voter has already cast a ballot");
        require(_tokensCommitted > 0, "Must commit tokens to vote");

        p.hasVoted[msg.sender] = true;
        p.totalTokensCommitted += _tokensCommitted;

        uint256 weight = sqrt(_tokensCommitted);

        if (_support == 1) {
            p.forVotesWeight += weight;
        } else if (_support == 0) {
            p.againstVotesWeight += weight;
        } else {
            p.abstainVotesWeight += weight;
        }

        emit VoteCast(_proposalId, msg.sender, _support, _tokensCommitted, weight);
    }

    function executeProposal(uint256 _proposalId) external {
        Proposal storage p = proposals[_proposalId];
        require(p.id != 0, "Proposal does not exist");
        require(block.timestamp > p.endTime, "Voting period still active");
        require(p.state == ProposalState.ACTIVE, "Proposal not in active state");

        if (p.totalTokensCommitted < p.quorumTokens) {
            p.state = ProposalState.DEFEATED;
        } else if (p.forVotesWeight > p.againstVotesWeight) {
            p.state = ProposalState.EXECUTED;
        } else {
            p.state = ProposalState.DEFEATED;
        }

        emit ProposalExecuted(_proposalId, p.state);
    }
}
