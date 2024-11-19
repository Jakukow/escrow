import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorBac } from "../../target/types/anchor_bac";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Initializing", () => {
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

  it("Initializes", async () => {
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

    const escrowState = await program.account.escrow.fetch(escrowAddress);
    assert.ok(escrowState.owner.equals(user.publicKey));
    assert.ok(escrowState.mint.equals(mint));
  });
});
