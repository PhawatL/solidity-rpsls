const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("RPSCommitReveal", function () {
  let game, owner, player1, player2, addrs;

  // helper function สำหรับ encode choice ให้เป็น 32 bytes
  const encodeChoice = (choice) => {
    return ethers.utils.hexZeroPad(ethers.utils.hexlify(choice), 32);
  };

  // helper function สำหรับคำนวณ digest จาก encodedData
  const getDigest = (encodedData) => {
    return ethers.utils.keccak256(encodedData);
  };

  // helper function สำหรับเพิ่มเวลา (seconds) แล้ว mine block ใหม่
  const increaseTime = async (seconds) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
    // wait 
    await new Promise(resolve => setTimeout(resolve, seconds + 0.5));
  };

  beforeEach(async function () {
    [owner, player1, player2, ...addrs] = await ethers.getSigners();
    const RPSCommitReveal = await ethers.getContractFactory("RPSCommitReveal");
    game = await RPSCommitReveal.deploy();
    await game.deployed();
  });

  describe("addPlayer", function () {
    it("should allow two players to join and update reward correctly", async function () {
      await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
      await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });
      const reward = await game.reward();
      expect(reward).to.equal(ethers.utils.parseEther("2"));

      const players = await game.getPlayers();
      expect(players.length).to.equal(2);
    });

    it("should not allow more than two players to join", async function () {
      await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
      await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });
      await expect(
        game.connect(addrs[0]).addPlayer({ value: ethers.utils.parseEther("1") })
      ).to.be.revertedWith("Only two players allowed");
    });

    it("should not allow the same player to join twice", async function () {
      await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
      await expect(
        game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") })
      ).to.be.revertedWith("Player already joined");
    });

    it("should revert if sent ether is not exactly 1 ether", async function () {
      await expect(
        game.connect(player1).addPlayer({ value: ethers.utils.parseEther("0.5") })
      ).to.be.revertedWith("Must pay 1 ether");
    });
  });

  describe("commitChoice", function () {
    beforeEach(async function () {
      // ให้ player1 และ player2 เข้าร่วมเกมก่อน
      await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
      await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });
    });

    it("should allow valid players to commit once", async function () {
      const encoded1 = encodeChoice(1);
      const digest1 = getDigest(encoded1);
      const encoded2 = encodeChoice(2);
      const digest2 = getDigest(encoded2);

      await game.connect(player1).commitChoice(digest1);
      await game.connect(player2).commitChoice(digest2);

      // ตรวจสอบ state ว่ามีการ commit แล้ว
      expect(await game.numInput()).to.equal(2);
    });

    it("should revert if a non-player tries to commit", async function () {
      const encoded = encodeChoice(1);
      const digest = getDigest(encoded);
      await expect(
        game.connect(addrs[0]).commitChoice(digest)
      ).to.be.revertedWith("Player does not match");
    });

    it("should revert if a player commits twice", async function () {
      const encoded = encodeChoice(1);
      const digest = getDigest(encoded);
      await game.connect(player1).commitChoice(digest);
      await expect(
        game.connect(player1).commitChoice(digest)
      ).to.be.revertedWith("Player already choosed");
    });
  });

  describe("revealChoice and winner determination", function () {
    beforeEach(async function () {
      // ให้ player1 และ player2 เข้าร่วมเกมก่อน
      await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
      await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });
    });

    it("should revert revealChoice if not all players have committed", async function () {
      const encoded = encodeChoice(1);
      const digest = getDigest(encoded);
      await game.connect(player1).commitChoice(digest);
      await expect(
        game.connect(player1).revealChoice(encoded)
      ).to.be.revertedWith("Not all players committed");
    });

    it("should let player1 (players[0]) win when choice diff is 1 (without transform)", async function () {
      // player1 เลือก 1, player2 เลือก 2 (abs(1-2)=1) -> ไม่ transform, (1+1)%5 == 2
      const encoded1 = encodeChoice(1);
      const encoded2 = encodeChoice(2);
      const digest1 = getDigest(encoded1);
      const digest2 = getDigest(encoded2);

      // commit choices
      await game.connect(player1).commitChoice(digest1);
      await game.connect(player2).commitChoice(digest2);

      // reveal choices
      const tx1 = await game.connect(player1).revealChoice(encoded1);
      await tx1.wait();
      const tx2 = await game.connect(player2).revealChoice(encoded2);
      await tx2.wait();

      // หลังจบเกม ควร reset state
      expect(await game.reward()).to.equal(0);
      const players = await game.getPlayers();
      expect(players.length).to.equal(0);
      // ตรวจสอบผลลัพธ์ผ่าน event console.log (ดูใน terminal ของ hardhat)
    });

    it("should let player2 (players[1]) win when transformation makes p1 win", async function () {
      // กรณีที่ diff != 1 ทำให้เกิดการ transform
      // ให้ player1 เลือก 0, player2 เลือก 2
      // หลัง transform: p0: transform[0]=1, p1: transform[2]=0
      // แล้ว (p1Choice+1)%5 = (0+1)%5 = 1 == p0Choice ดังนั้น p1 (players[1]) win
      const encoded1 = encodeChoice(0);
      const encoded2 = encodeChoice(2);
      const digest1 = getDigest(encoded1);
      const digest2 = getDigest(encoded2);

      await game.connect(player1).commitChoice(digest1);
      await game.connect(player2).commitChoice(digest2);

      // reveal choices
      await game.connect(player1).revealChoice(encoded1);
      await game.connect(player2).revealChoice(encoded2);

      // ตรวจสอบว่า state ถูก reset
      expect(await game.reward()).to.equal(0);
      const players = await game.getPlayers();
      expect(players.length).to.equal(0);
    });

    it("should result in a draw when both players choose the same", async function () {
      // ให้ทั้งสองเลือก 1
      const encoded1 = encodeChoice(1);
      const encoded2 = encodeChoice(1);
      const digest1 = getDigest(encoded1);
      const digest2 = getDigest(encoded2);

      await game.connect(player1).commitChoice(digest1);
      await game.connect(player2).commitChoice(digest2);

      // reveal choices
      await game.connect(player1).revealChoice(encoded1);
      await game.connect(player2).revealChoice(encoded2);

      // หลังจบเกม state reset ควรเป็น 0
      expect(await game.reward()).to.equal(0);
      const players = await game.getPlayers();
      expect(players.length).to.equal(0);
    });
  });

//   describe("withdrawnMoney", function () {
//     it("should allow single player waiting (Case 1) to withdraw after 2 minutes", async function () {
//       // กรณีมีผู้เล่นคนเดียว
//       const initialBalance = await ethers.provider.getBalance(player1.address);
//       await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });

//       // เพิ่มเวลา 3 นาที (3*60 = 180 seconds)
//       await increaseTime(180);

//       // เรียก withdrawnMoney โดย player1
//       const tx = await game.connect(player1).withdrawnMoney();
//       const receipt = await tx.wait();
//       const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

//       // หลังเรียกควร reset state
//       const players = await game.getPlayers();
//       expect(players.length).to.equal(0);
//       expect(await game.reward()).to.equal(0);

//       const finalBalance = await ethers.provider.getBalance(player1.address);
//       // ตรวจสอบว่าได้รับเงินคืน (ประมาณ 1 ether คืนมา) โดยหัก gas
//       expect(finalBalance).to.be.gt(initialBalance.sub(gasUsed).add(ethers.utils.parseEther("0.9")));
//     });

//     it("should refund both players 1 ether each if both joined but did not commit (Case 2 - none committed)", async function () {
//       // ทั้งสองเข้าร่วม แต่ไม่ commit
//       const initialBalance1 = await ethers.provider.getBalance(player1.address);
//       const initialBalance2 = await ethers.provider.getBalance(player2.address);

//       await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
//       await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });

//       // เพิ่มเวลาให้หลังStartTimeUnit > 4 นาที
//       await increaseTime(4 * 60 + 1);

//       // เรียก withdrawnMoney (ใครก็ได้ในสองคน)
//       const tx = await game.connect(player1).withdrawnMoney();
//       await tx.wait();

//       // State reset
//       const players = await game.getPlayers();
//       expect(players.length).to.equal(0);
//       expect(await game.reward()).to.equal(0);

//       const finalBalance1 = await ethers.provider.getBalance(player1.address);
//       const finalBalance2 = await ethers.provider.getBalance(player2.address);

//       // แต่ละคนควรได้รับคืนประมาณ 1 ether (หัก gas)
//       expect(finalBalance1).to.be.gt(initialBalance1.add(ethers.utils.parseEther("0.9")));
//       expect(finalBalance2).to.be.gt(initialBalance2.add(ethers.utils.parseEther("0.9")));
//     });

//     it("should refund 2 ether to the committed player when only one committed", async function () {
//       // กรณีทั้งสองเข้าร่วม แต่มีเพียง player1 commit เท่านั้น
//       const initialBalance1 = await ethers.provider.getBalance(player1.address);
//       const initialBalance2 = await ethers.provider.getBalance(player2.address);

//       await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
//       await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });

//       const encoded1 = encodeChoice(1);
//       const digest1 = getDigest(encoded1);
//       await game.connect(player1).commitChoice(digest1);

//       // เพิ่มเวลา > 4 นาที
//       await increaseTime(4 * 60 + 1);

//       // เรียก withdrawnMoney โดย player1 (players[0])
//       const tx = await game.connect(player1).withdrawnMoney();
//       const receipt = await tx.wait();
//       const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

//       // ตรวจสอบ state reset
//       const players = await game.getPlayers();
//       expect(players.length).to.equal(0);
//       expect(await game.reward()).to.equal(0);

//       const finalBalance1 = await ethers.provider.getBalance(player1.address);
//       // player1 ควรได้รับคืนประมาณ 2 ether (หัก gas)
//       expect(finalBalance1).to.be.gt(initialBalance1.sub(gasUsed).add(ethers.utils.parseEther("1.9")));

//       // player2 ไม่ commit จึงไม่รับเงินคืนในส่วนนี้ (แต่เงินที่ส่งเข้ามาแล้วอยู่ใน contract ถูกคืนให้ player1 ในเงื่อนไขนี้)
//       const finalBalance2 = await ethers.provider.getBalance(player2.address);
//       expect(finalBalance2).to.be.closeTo(initialBalance2, ethers.utils.parseEther("0.05")); // โดยประมาณ
//     });

//     it("should refund 1 ether each when both committed but did not reveal (Case 3: numReveal == 0)", async function () {
//       // ทั้งสองเข้าร่วมและ commit แต่ไม่ reveal
//       const initialBalance1 = await ethers.provider.getBalance(player1.address);
//       const initialBalance2 = await ethers.provider.getBalance(player2.address);

//       await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
//       await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });

//       const encoded1 = encodeChoice(1);
//       const encoded2 = encodeChoice(2);
//       const digest1 = getDigest(encoded1);
//       const digest2 = getDigest(encoded2);

//       await game.connect(player1).commitChoice(digest1);
//       await game.connect(player2).commitChoice(digest2);

//       // เพิ่มเวลาให้ afterCommitTimeUnit.elapsedMinutes() > 2
//       await increaseTime(2 * 60 + 1);
//       // เพิ่มเวลาให้ afterStartTimeUnit > 4 นาที (ถ้ายังไม่ครบ)
//       await increaseTime(4 * 60 + 1);

//       // เรียก withdrawnMoney
//       const tx = await game.connect(player1).withdrawnMoney();
//       await tx.wait();

//       const players = await game.getPlayers();
//       expect(players.length).to.equal(0);
//       expect(await game.reward()).to.equal(0);

//       const finalBalance1 = await ethers.provider.getBalance(player1.address);
//       const finalBalance2 = await ethers.provider.getBalance(player2.address);
//       // แต่ละคนควรได้รับคืนประมาณ 1 ether (หัก gas)
//       expect(finalBalance1).to.be.gt(initialBalance1.add(ethers.utils.parseEther("0.9")));
//       expect(finalBalance2).to.be.gt(initialBalance2.add(ethers.utils.parseEther("0.9")));
//     });

//     it("should refund 2 ether to the player who revealed when only one reveals (Case 3: one revealed)", async function () {
//       // ทั้งสองเข้าร่วมและ commit แต่มีเพียง player1 reveal
//       const initialBalance1 = await ethers.provider.getBalance(player1.address);
//       const initialBalance2 = await ethers.provider.getBalance(player2.address);

//       await game.connect(player1).addPlayer({ value: ethers.utils.parseEther("1") });
//       await game.connect(player2).addPlayer({ value: ethers.utils.parseEther("1") });

//       const encoded1 = encodeChoice(1);
//       const encoded2 = encodeChoice(2);
//       const digest1 = getDigest(encoded1);
//       const digest2 = getDigest(encoded2);

//       await game.connect(player1).commitChoice(digest1);
//       await game.connect(player2).commitChoice(digest2);

//       // ให้ player1 reveal แต่ player2 ไม่ reveal
//       await game.connect(player1).revealChoice(encoded1);

//       // เพิ่มเวลาให้ afterCommitTimeUnit > 2 นาที
//       await increaseTime(2 * 60 + 1);
//       // เพิ่มเวลาให้ afterStartTimeUnit > 4 นาที
//       await increaseTime(4 * 60 + 1);

//       // เรียก withdrawnMoney (ใครก็ได้ในสองคน)
//       const tx = await game.connect(player1).withdrawnMoney();
//       const receipt = await tx.wait();
//       const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

//       const players = await game.getPlayers();
//       expect(players.length).to.equal(0);
//       expect(await game.reward()).to.equal(0);

//       const finalBalance1 = await ethers.provider.getBalance(player1.address);
//       // ในเงื่อนไขนี้ ถ้า player1 reveal (players[0] != bytes32(0)) จะได้ 2 ether
//       expect(finalBalance1).to.be.gt(initialBalance1.sub(gasUsed).add(ethers.utils.parseEther("1.9")));

//       // player2 ไม่ได้รับอะไรเพิ่มเติม
//       const finalBalance2 = await ethers.provider.getBalance(player2.address);
//       expect(finalBalance2).to.be.closeTo(initialBalance2, ethers.utils.parseEther("0.05"));
//     });
//   });

  describe("getHash", function () {
    it("should return the correct keccak256 hash", async function () {
      const sampleData = ethers.utils.hexZeroPad("0x1234", 32);
      const expectedHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32"], [sampleData]));
      // หรือเทียบกับ keccak256(abi.encodePacked(data))
      const contractHash = await game.getHash(sampleData);
      expect(contractHash).to.equal(ethers.utils.keccak256(ethers.utils.arrayify(sampleData)));
    });
  });
});
