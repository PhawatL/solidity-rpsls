// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;
import "./CommitReveal.sol";
import "./TimeUnit.sol";

contract RPSCommitReveal {
    uint256 public numPlayer = 0;
    uint256 public reward = 0;
    address[] private players;

    CommitReveal public cr = new CommitReveal();
    TimeUnit public timeUnit = new TimeUnit();

    mapping(address => bytes32) public playerChoice;
    mapping(address => bool) public isPlayed;

    mapping(uint256 => uint256) private transform;
    uint256 public numInput = 0;
    uint256 public numReveal;

    constructor() {
        timeUnit.setStartTime();

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
        require(numPlayer < 2, "Only two players allowed");
        if (numPlayer > 0) {
            require(msg.sender != players[0], "Player already joined");
        }
        require(msg.value == 1 ether, "Must pay 1 ether");
        reward += msg.value;
        players.push(msg.sender);

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

    function withdrawnMoney() public  {
        require(msg.sender == players[0] || msg.sender == players[1], "Player does not match");
        require(timeUnit.elapsedMinutes() > 2,"Wait for 2 minutes");

        if (isPlayed[players[0]] && isPlayed[players[1]] ){ // player ทั้ง 2 commit แล้ว แต่

        }else{ // ยังมี player คนใดคนนึงยังไม่ commit ให้คืนเงินให้กกับทั้งคู่

        }
    }

    function _reset() private {
        // Clear stored data for each player
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            delete isPlayed[player];
            delete playerChoice[player];
        }
        // Clear the players array
        delete players;

        // Reset game state variables
        numInput = 0;
        numPlayer = 0;
        reward = 0;
    }

    // ฟังก์ชันคำนวณค่าต่างแบบ Absolute
    function abs(int256 x, int256 y) private pure returns (int256) {
        return (x - y) >= 0 ? (x - y) : -(x - y);
    }

    function getHash(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(data));
    }
}
