import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { AnchorBac } from "../../target/types/anchor_bac";

describe("Withdraw", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AnchorEscrow as Program<AnchorBac>;

  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let initToken = 1000;
  const user = Keypair.generate();
  const userUnauthorized = Keypair.generate();
  const mintAuth = Keypair.generate();

  before(async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      user.publicKey,
      LAMPORTS_PER_SOL
    );
    const airdropSignatureUnauthorized =
      await provider.connection.requestAirdrop(
        userUnauthorized.publicKey,
        LAMPORTS_PER_SOL
      );
    const latestBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignatureUnauthorized,
    });

    mint = await createMint(
      provider.connection,
      user,
      mintAuth.publicKey,
      null,
      9
    );
    const userATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      mint,
      user.publicKey
    );
    userTokenAccount = userATA.address;

    await mintTo(
      provider.connection,
      user,
      mint,
      userTokenAccount,
      mintAuth,
      initToken * 10 ** 9
    );
  });

  it("Withdraw tokens", async () => {
    const amount = 300 * 10 ** 9;

    const [escrowAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("Escrow")],
      program.programId
    );

    await program.methods
      .initialize()
      .accountsPartial({
        escrow: escrowAddress,
        mint: mint,
        owner: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    const escrowTokenAccount = getAssociatedTokenAddressSync(
      mint,
      escrowAddress,
      true
    );
    const [userStateAdress] = PublicKey.findProgramAddressSync(
      [Buffer.from("UserState"), user.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .deposit(new anchor.BN(amount))
      .accountsStrict({
        userDeposit: escrowTokenAccount,
        escrow: escrowAddress,
        userState: userStateAdress,
        user: user.publicKey,
        mint: mint,
        userAta: userTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const amountWithdraw = 200 * 10 ** 9;

    await program.methods
      .withdraw(new anchor.BN(amountWithdraw))
      .accountsStrict({
        userDeposit: escrowTokenAccount,
        escrow: escrowAddress,
        userState: userStateAdress,
        user: user.publicKey,
        mint: mint,
        userAta: userTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const escrowATABalanceWithdraw =
      await provider.connection.getTokenAccountBalance(escrowTokenAccount);

    const [userStateWithdraw] = PublicKey.findProgramAddressSync(
      [Buffer.from("UserState"), user.publicKey.toBuffer()],
      program.programId
    );
    const balanceWithdraw = await program.account.userState.fetch(
      userStateWithdraw
    );

    const userATABalanceWithdraw =
      await provider.connection.getTokenAccountBalance(userTokenAccount);
    assert.ok(
      new anchor.BN(balanceWithdraw.amount).eq(
        new anchor.BN(escrowATABalanceWithdraw.value.amount)
      )
    );
    assert.ok(
      new anchor.BN(userATABalanceWithdraw.value.amount).eq(
        new anchor.BN(initToken * 10 ** 9 - 300 * 10 ** 9 + amountWithdraw)
      )
    );
  });
});
