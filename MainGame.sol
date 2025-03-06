// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;
import "./CommitReveal.sol";
import "./TimeUnit.sol";

contract RPSCommitReveal {
    uint256 public numPlayer = 0;
    uint256 public reward = 0;
    address[] private players;

    CommitReveal public cr = new CommitReveal();
    TimeUnit public afterStartTimeUnit = new TimeUnit();
    TimeUnit public afterCommitTimeUnit = new TimeUnit();

    mapping(address => bytes32) public playerChoice;
    mapping(address => bool) public isPlayed;

    mapping(uint256 => uint256) private transform;
    uint256 public numInput = 0;
    uint256 public numReveal;

    constructor() {
        afterStartTimeUnit.setStartTime();

        transform[2] = 0;
        transform[0] = 1;
        transform[3] = 2;
        transform[1] = 3;
        transform[4] = 4;
    }

    function getPlayers() public view returns (address[] memory) {
        return players;
    }

    function addPlayer() public payable {
        require(
            msg.sender == 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4 ||
                msg.sender == 0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2 ||
                msg.sender == 0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db ||
                msg.sender == 0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB,
            "You are not allowed to join"
        );
        require(numPlayer < 2, "Only two players allowed");
        if (numPlayer > 0) {
            require(msg.sender != players[0], "Player already joined");
        }
        require(msg.value == 1 ether, "Must pay 1 ether");
        reward += msg.value;
        players.push(msg.sender);

        if (numPlayer == 0) {
            afterStartTimeUnit.setStartTime();
        }
        if (numPlayer == 2){
            afterStartTimeUnit.setStartTime();
        }

        numPlayer++;
    }

    function commitChoice(bytes32 digest) public {
        require(!isPlayed[msg.sender], "Player already choosed");
        require(
            msg.sender == players[0] || msg.sender == players[1],
            "Player does not match"
        );

        cr.commit(msg.sender, digest);
        isPlayed[msg.sender] = true;
        numInput++;
        if (numInput == 2) {
            afterCommitTimeUnit.setStartTime();
        }
    }

    // ส่ง ข้อมูลตัั้งต้นก่อนเข้า hash function เข้ามา หรือก็คือ random byte 31 bytes concat กับ choice ที่เลือก 1 byte
    function revealChoice(bytes32 encodedData) public {
        require(numInput == 2, "Not all players committed");
        cr.reveal(msg.sender, encodedData);

        numReveal++;
        playerChoice[msg.sender] = encodedData;
        if (numReveal == 2) {
            _checkWinnerAndPay();
        }
    }

    function _checkWinnerAndPay() private {
        bytes32 p0EncodedChoice = playerChoice[players[0]];
        bytes32 p1EncodedChoice = playerChoice[players[1]];

        // get last byte of each bytes32 value and convert to int
        bytes1 lastByte = p0EncodedChoice[31];
        uint8 value = uint8(lastByte);
        uint256 p0Choice = uint256(value);

        bytes1 lastByteP1 = p1EncodedChoice[31];
        uint8 valueP1 = uint8(lastByteP1);
        uint256 p1Choice = uint256(valueP1);

        address payable account0 = payable(players[0]);
        address payable account1 = payable(players[1]);

        if (abs(int256(p0Choice), int256(p1Choice)) != 1) {
            p0Choice = transform[p0Choice];
            p1Choice = transform[p1Choice];
        }

        if ((p0Choice + 1) % 5 == p1Choice) {
            account0.transfer(reward);
        } else if ((p1Choice + 1) % 5 == p0Choice) {
            account1.transfer(reward);
        } else {
            // กรณีเสมอ
            account0.transfer(reward / 2);
            account1.transfer(reward / 2);
        }

        // reset game
        _reset();
    }

    function uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) {
            return "0";
        }
        uint256 j = v;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (v != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(v % 10));
            bstr[k] = bytes1(temp);
            v /= 10;
        }
        return string(bstr);
    }

    function withdrawnMoney() public {
        require(numPlayer > 0, "Not enough players");
        address payable account0 = payable(players[0]);
        uint256 elapsed = afterStartTimeUnit.elapsedSeconds();
        if (players.length == 1) {
            require(msg.sender == players[0], "Player does not match");
            // Case 1: Single player waiting

            require(
                elapsed > 20,
                string(
                    abi.encodePacked(
                        "Elapsed time: ",
                        uintToString(elapsed),
                        " seconds. Please wait until 20 seconds. (Single player waiting)"
                    )
                )
            );

            account0.transfer(reward);
            _reset();
            return;
        } else {
            require(
                msg.sender == players[0] || msg.sender == players[1],
                "Player does not match"
            );
        }

        address payable account1 = payable(players[1]);
        elapsed = afterStartTimeUnit.elapsedSeconds();
        // Case 2: Both players joined but didn't commit

        require(
            elapsed > 60,
            string(
                abi.encodePacked(
                    "Elapsed time: ",
                    uintToString(elapsed),
                    " seconds. Please wait until 60 seconds. (Both players have joined, but not all have committed)"
                )
            )
        );
        elapsed = afterCommitTimeUnit.elapsedSeconds();
        if (!isPlayed[players[0]] && !isPlayed[players[1]]) {
            // no one commit
            account0.transfer(reward / 2);
            account1.transfer(reward / 2);
        } else if (isPlayed[players[0]] && !isPlayed[players[1]]) {
            // only 1 committed
            account0.transfer(reward);
        } else if (!isPlayed[players[0]] && isPlayed[players[1]]) {
            // only 1 committed
            account1.transfer(reward);
        } else {
            // Case 3: Both committed but didn't reveal
            require(
                elapsed > 30,
                string(
                    abi.encodePacked(
                        "Elapsed time: ",
                        uintToString(elapsed),
                        " seconds. Please wait until 30 seconds after last player commit."
                    )
                )
            );
            if (numReveal == 0) {
                account0.transfer(reward / 2);
                account1.transfer(reward / 2);
            } else if (playerChoice[players[0]] != bytes32(0)) {
                account0.transfer(reward);
            } else {
                account1.transfer(reward);
            }
        }
        _reset();
    }

    function _reset() private {
        // Clear CommitReveal data
        for (uint256 i = 0; i < players.length; i++) {
            cr.resetPlayer(players[i]);
        }

        // Clear game state
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            delete isPlayed[player];
            delete playerChoice[player];
        }
        delete players;

        numInput = 0;
        numReveal = 0;
        numPlayer = 0;
        reward = 0;
    }

    function abs(int256 x, int256 y) private pure returns (int256) {
        return (x - y) >= 0 ? (x - y) : -(x - y);
    }

    function getHash(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(data));
    }
}
