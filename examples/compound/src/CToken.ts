import {
  u256,
  u128,
  address,
  storage,
  msg,
  revert,
  view,
  Mapping,
  block,
} from "../../../runtime/index.js";

// Simplified Compound cToken - https://github.com/compound-finance/compound-protocol
export class CToken {
  // Constants (1e18 mantissa precision)
  private MANTISSA: u256 = 1000000000000000000n;
  private INITIAL_EXCHANGE_RATE: u256 = 20000000000000000n; // 0.02
  private RESERVE_FACTOR: u256 = 100000000000000000n; // 10%
  private COLLATERAL_FACTOR: u256 = 750000000000000000n; // 75%
  private BASE_RATE_PER_BLOCK: u256 = 23782343987n; // ~5% APY
  private MULTIPLIER_PER_BLOCK: u256 = 47564687975n;

  // Storage
  @storage totalSupply: u256 = 0n;
  @storage totalBorrows: u256 = 0n;
  @storage totalReserves: u256 = 0n;
  @storage totalCash: u256 = 0n;
  @storage borrowIndex: u256 = 1000000000000000000n;
  @storage accrualBlockNumber: u256 = 0n;
  @storage accountTokens: Mapping<address, u256>;
  @storage accountBorrowPrincipal: Mapping<address, u256>;
  @storage accountBorrowIndex: Mapping<address, u256>;
  @storage allowances: Mapping<address, Mapping<address, u256>>;
  @storage initialized: u256 = 0n;

  // exchangeRate = (totalCash + totalBorrows - totalReserves) / totalSupply
  @view
  public exchangeRateStored(): u256 {
    if (this.totalSupply === 0n) {
      return this.INITIAL_EXCHANGE_RATE;
    }
    const totalAssets = this.totalCash + this.totalBorrows - this.totalReserves;
    return (totalAssets * this.MANTISSA) / this.totalSupply;
  }

  @view
  public getTotalSupply(): u256 {
    return this.totalSupply;
  }

  @view
  public getTotalBorrows(): u256 {
    return this.totalBorrows;
  }

  @view
  public getTotalReserves(): u256 {
    return this.totalReserves;
  }

  @view
  public getCash(): u256 {
    return this.totalCash;
  }

  @view
  public balanceOf(account: address): u256 {
    return this.accountTokens[account];
  }

  @view
  public balanceOfUnderlying(account: address): u256 {
    return (this.accountTokens[account] * this.exchangeRateStored()) / this.MANTISSA;
  }

  @view
  public borrowBalanceStored(account: address): u256 {
    const principal = this.accountBorrowPrincipal[account];
    if (principal === 0n) {
      return 0n;
    }

    const accountIndex = this.accountBorrowIndex[account];
    if (accountIndex === 0n) {
      return 0n;
    }

    return (principal * this.borrowIndex) / accountIndex;
  }

  @view
  public borrowRatePerBlock(): u256 {
    return this._getBorrowRate();
  }

  @view
  public supplyRatePerBlock(): u256 {
    const borrowRate = this._getBorrowRate();
    const utilizationRate = this._getUtilizationRate();
    const oneMinusReserveFactor = this.MANTISSA - this.RESERVE_FACTOR;
    return (borrowRate * utilizationRate * oneMinusReserveFactor) / this.MANTISSA / this.MANTISSA;
  }

  @view
  public getAccountSnapshot(account: address): [u256, u256, u256] {
    return [
      this.accountTokens[account],
      this.borrowBalanceStored(account),
      this.exchangeRateStored(),
    ];
  }

  public initialize(initialCash: u256): u256 {
    if (this.initialized !== 0n) {
      revert("AI");
    }

    this.totalCash = initialCash;
    this.accrualBlockNumber = block.number;
    this.initialized = 1n;

    return 1n;
  }

  public accrueInterest(): u256 {
    const currentBlockNumber = block.number;
    const accrualBlockNumberPrior = this.accrualBlockNumber;

    if (currentBlockNumber === accrualBlockNumberPrior) {
      return 1n;
    }

    const borrowsPrior = this.totalBorrows;
    const reservesPrior = this.totalReserves;
    const borrowIndexPrior = this.borrowIndex;
    const borrowRate = this._getBorrowRate();
    const blockDelta = currentBlockNumber - accrualBlockNumberPrior;
    const simpleInterestFactor = borrowRate * blockDelta;
    const interestAccumulated = (simpleInterestFactor * borrowsPrior) / this.MANTISSA;

    this.totalBorrows = borrowsPrior + interestAccumulated;

    const reservesAdded = (this.RESERVE_FACTOR * interestAccumulated) / this.MANTISSA;
    this.totalReserves = reservesPrior + reservesAdded;

    this.borrowIndex = borrowIndexPrior + (borrowIndexPrior * simpleInterestFactor) / this.MANTISSA;
    this.accrualBlockNumber = currentBlockNumber;

    return 1n;
  }

  public mint(mintAmount: u256): u256 {
    if (this.initialized === 0n) {
      revert("NI");
    }

    if (mintAmount === 0n) {
      revert("ZA");
    }

    const _a1 = this.accrueInterest();

    const exchangeRate = this.exchangeRateStored();
    const mintTokens = (mintAmount * this.MANTISSA) / exchangeRate;

    this.totalCash = this.totalCash + mintAmount;
    this.totalSupply = this.totalSupply + mintTokens;
    this.accountTokens[msg.sender] = this.accountTokens[msg.sender] + mintTokens;

    return mintTokens;
  }

  public redeem(redeemTokens: u256): u256 {
    if (redeemTokens === 0n) {
      revert("ZA");
    }

    const _a2 = this.accrueInterest();

    const sender = msg.sender;
    const accountBalance = this.accountTokens[sender];

    if (redeemTokens > accountBalance) {
      revert("IB");
    }

    const exchangeRate = this.exchangeRateStored();
    const redeemAmount = (redeemTokens * exchangeRate) / this.MANTISSA;

    if (redeemAmount > this.totalCash) {
      revert("IC");
    }

    this._checkRedeemAllowed(sender, redeemTokens);

    this.totalCash = this.totalCash - redeemAmount;
    this.totalSupply = this.totalSupply - redeemTokens;
    this.accountTokens[sender] = accountBalance - redeemTokens;

    return redeemAmount;
  }

  public redeemUnderlying(redeemAmount: u256): u256 {
    if (redeemAmount === 0n) {
      revert("ZA");
    }

    const _a3 = this.accrueInterest();

    const sender = msg.sender;

    if (redeemAmount > this.totalCash) {
      revert("IC");
    }

    const exchangeRate = this.exchangeRateStored();
    const redeemTokens = (redeemAmount * this.MANTISSA) / exchangeRate;

    const accountBalance = this.accountTokens[sender];
    if (redeemTokens > accountBalance) {
      revert("IB");
    }

    this._checkRedeemAllowed(sender, redeemTokens);

    this.totalCash = this.totalCash - redeemAmount;
    this.totalSupply = this.totalSupply - redeemTokens;
    this.accountTokens[sender] = accountBalance - redeemTokens;

    return redeemTokens;
  }

  public borrow(borrowAmount: u256): u256 {
    if (this.initialized === 0n) {
      revert("NI");
    }

    if (borrowAmount === 0n) {
      revert("ZA");
    }

    const _a4 = this.accrueInterest();

    if (borrowAmount > this.totalCash) {
      revert("IC");
    }

    const borrower = msg.sender;
    this._checkBorrowAllowed(borrower, borrowAmount);

    const accountBorrowsPrev = this.borrowBalanceStored(borrower);
    const accountBorrowsNew = accountBorrowsPrev + borrowAmount;
    this.accountBorrowPrincipal[borrower] = accountBorrowsNew;
    this.accountBorrowIndex[borrower] = this.borrowIndex;

    this.totalBorrows = this.totalBorrows + borrowAmount;
    this.totalCash = this.totalCash - borrowAmount;

    return borrowAmount;
  }

  public repayBorrow(repayAmount: u256): u256 {
    const _a5 = this.accrueInterest();
    return this._repayBorrowFresh(msg.sender, msg.sender, repayAmount);
  }

  public repayBorrowBehalf(borrower: address, repayAmount: u256): u256 {
    const _a6 = this.accrueInterest();
    return this._repayBorrowFresh(msg.sender, borrower, repayAmount);
  }

  public liquidateBorrow(borrower: address, repayAmount: u256): u256 {
    if (borrower === msg.sender) {
      revert("LS");
    }

    const _a7 = this.accrueInterest();

    const borrowBalance = this.borrowBalanceStored(borrower);
    const collateralValue = this.balanceOfUnderlying(borrower);
    const maxBorrowValue = (collateralValue * this.COLLATERAL_FACTOR) / this.MANTISSA;

    if (borrowBalance <= maxBorrowValue) {
      revert("NL");
    }

    const actualRepayAmount = this._repayBorrowFresh(msg.sender, borrower, repayAmount);

    // Seize amount = repay * 1.08 liquidation incentive / exchangeRate
    const exchangeRate = this.exchangeRateStored();
    const seizeTokens =
      ((actualRepayAmount * 1080000000000000000n) / exchangeRate / this.MANTISSA) * this.MANTISSA;

    const borrowerTokens = this.accountTokens[borrower];
    const actualSeizeTokens = seizeTokens > borrowerTokens ? borrowerTokens : seizeTokens;

    this.accountTokens[borrower] = borrowerTokens - actualSeizeTokens;
    this.accountTokens[msg.sender] = this.accountTokens[msg.sender] + actualSeizeTokens;

    return actualSeizeTokens;
  }

  public transfer(to: address, amount: u256): u256 {
    return this._transferTokens(msg.sender, to, amount);
  }

  public transferFrom(from: address, to: address, amount: u256): u256 {
    const sender = msg.sender;
    const allowed = this.allowances[from][sender];
    if (allowed < amount) {
      revert("IA");
    }

    this.allowances[from][sender] = allowed - amount;
    return this._transferTokens(from, to, amount);
  }

  public approve(spender: address, amount: u256): u256 {
    this.allowances[msg.sender][spender] = amount;
    return 1n;
  }

  @view
  public allowance(owner: address, spender: address): u256 {
    return this.allowances[owner][spender];
  }

  public addReserves(addAmount: u256): u256 {
    const _a8 = this.accrueInterest();

    this.totalCash = this.totalCash + addAmount;
    this.totalReserves = this.totalReserves + addAmount;

    return this.totalReserves;
  }

  // utilizationRate = borrows / (cash + borrows - reserves)
  private _getUtilizationRate(): u256 {
    if (this.totalBorrows === 0n) {
      return 0n;
    }

    const total = this.totalCash + this.totalBorrows - this.totalReserves;
    if (total === 0n) {
      return 0n;
    }

    return (this.totalBorrows * this.MANTISSA) / total;
  }

  // borrowRate = baseRate + multiplier * utilizationRate
  private _getBorrowRate(): u256 {
    const utilizationRate = this._getUtilizationRate();
    return this.BASE_RATE_PER_BLOCK + (this.MULTIPLIER_PER_BLOCK * utilizationRate) / this.MANTISSA;
  }

  private _checkRedeemAllowed(redeemer: address, redeemTokens: u256): void {
    const borrowBalance = this.borrowBalanceStored(redeemer);
    if (borrowBalance === 0n) {
      return;
    }

    const exchangeRate = this.exchangeRateStored();
    const remainingTokens = this.accountTokens[redeemer] - redeemTokens;
    const remainingCollateral = (remainingTokens * exchangeRate) / this.MANTISSA;
    const maxBorrow = (remainingCollateral * this.COLLATERAL_FACTOR) / this.MANTISSA;

    if (borrowBalance > maxBorrow) {
      revert("IC");
    }
  }

  private _checkBorrowAllowed(borrower: address, borrowAmount: u256): void {
    const collateralValue = this.balanceOfUnderlying(borrower);
    const maxBorrowValue = (collateralValue * this.COLLATERAL_FACTOR) / this.MANTISSA;
    const totalBorrowsNew = this.borrowBalanceStored(borrower) + borrowAmount;

    if (totalBorrowsNew > maxBorrowValue) {
      revert("IC");
    }
  }

  private _repayBorrowFresh(payer: address, borrower: address, repayAmount: u256): u256 {
    const accountBorrows = this.borrowBalanceStored(borrower);

    if (accountBorrows === 0n) {
      revert("NB");
    }

    const actualRepayAmount = repayAmount > accountBorrows ? accountBorrows : repayAmount;
    const accountBorrowsNew = accountBorrows - actualRepayAmount;
    this.accountBorrowPrincipal[borrower] = accountBorrowsNew;
    this.accountBorrowIndex[borrower] = this.borrowIndex;

    this.totalBorrows = this.totalBorrows - actualRepayAmount;
    this.totalCash = this.totalCash + actualRepayAmount;

    return actualRepayAmount;
  }

  private _transferTokens(from: address, to: address, amount: u256): u256 {
    if (amount === 0n) {
      return 1n;
    }

    const fromBalance = this.accountTokens[from];
    if (fromBalance < amount) {
      revert("IB");
    }

    this._checkRedeemAllowed(from, amount);

    this.accountTokens[from] = fromBalance - amount;
    this.accountTokens[to] = this.accountTokens[to] + amount;

    return 1n;
  }
}
