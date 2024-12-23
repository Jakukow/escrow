use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;

use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

declare_id!("HsWWZRxGbhSi56q9EqHHwpNvPF8sH993MXP6JMvuNjDH");

#[program]
pub mod anchor_bac {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.owner = ctx.accounts.owner.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.bump = ctx.bumps.escrow;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let user_balance = ctx.accounts.user_ata.amount;
        require!(
            ctx.accounts.escrow.owner == ctx.accounts.user.key(),
            EscrowError::Unauthorized
        );
        require!(amount <= user_balance, EscrowError::InsufficientFunds);
        let user_state = &mut ctx.accounts.user_state;

        user_state.amount += amount;
        user_state.bump = ctx.bumps.user_state;
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.user_ata.to_account_info(),
                    to: ctx.accounts.user_deposit.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        Ok(())
    }

    #[error_code]
    pub enum EscrowError {
        #[msg("Insufficient funds in Escrow account.")]
        InsufficientFunds,
        #[msg("Unauthorized access.")]
        Unauthorized,
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_state = &mut ctx.accounts.user_state;

        require!(amount <= user_state.amount, EscrowError::InsufficientFunds);
        user_state.amount -= amount;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.user_deposit.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
            )
            .with_signer(&[&[b"Escrow".as_ref(), &[ctx.accounts.escrow.bump]]]),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        Ok(())
    }
}
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"Escrow".as_ref()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, constraint = mint.key() == escrow.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        space = 8 + UserState::INIT_SPACE,
        seeds = [b"UserState".as_ref(), user.key().as_ref()],
        payer = user,
        bump
    )]
    pub user_state: Account<'info, UserState>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub user_deposit: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, space=8+Escrow::INIT_SPACE, seeds=[b"Escrow".as_ref()], bump, payer=owner)]
    pub escrow: Account<'info, Escrow>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default, Debug, InitSpace)]
pub struct Escrow {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(Default, Debug, InitSpace)]
pub struct UserState {
    pub amount: u64,
    pub bump: u8,
}
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"Escrow".as_ref()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, constraint = mint.key() == escrow.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, seeds = [b"UserState".as_ref(), user.key().as_ref()], bump = user_state.bump)]
    pub user_state: Account<'info, UserState>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = user)]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = escrow)]
    pub user_deposit: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
