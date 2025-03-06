// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

contract CommitReveal {
    uint8 public max = 100;

    struct Commit {
        bytes32 commit;
        uint64 block;
        bool revealed;
    }

    mapping(address => Commit) public commits;

    function commit(address sender, bytes32 dataHash) public {
        commits[sender].commit = dataHash;
        commits[sender].block = uint64(block.number);
        commits[sender].revealed = false;
        emit CommitHash(sender, commits[sender].commit, commits[sender].block);
    }

    event CommitHash(address sender, bytes32 dataHash, uint64 block);

    function reveal(address sender,bytes32 revealHash) public {
        require(
            commits[sender].revealed == false,
            "CommitReveal::reveal: Already revealed"
        );
        commits[sender].revealed = true;
        require(
            getHash(revealHash) == commits[sender].commit,
            "CommitReveal::reveal: Revealed hash does not match commit"
        );
        require(
            uint64(block.number) > commits[sender].block,
            "CommitReveal::reveal: Reveal and commit happened on the same block"
        );
        require(
            uint64(block.number) <= commits[sender].block + 250,
            "CommitReveal::reveal: Revealed too late"
        );
        bytes32 blockHash = blockhash(commits[sender].block);
        uint256 random = uint256(
            keccak256(abi.encodePacked(blockHash, revealHash))
        ) % max;
        emit RevealHash(sender, revealHash, random);
    }

    event RevealHash(address sender, bytes32 revealHash, uint256 random);

    // นำ choice concat กับ random bits ให้ได้ความยาว 128 bits หรือ 32 bytes มาใส่ใน function นี้เพื่อให้ได้ค่า hash
    function getHash(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(data));
    }

    function resetPlayer(address player) public {
        delete commits[player];
    }
}
