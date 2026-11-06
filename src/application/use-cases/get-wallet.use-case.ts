import { NotFoundException } from "@nestjs/common";
import { Wallet } from "../../domain/wallet/wallet";
import type { WalletRepository } from "../../domain/wallet/wallet.repository.interface";

export interface GetWalletCommand {
  walletId: string;
}

export interface GetWalletResult {
  wallet: Wallet;
}

export class GetWalletUseCase {
  constructor(private readonly walletRepository: WalletRepository) {}

  async execute(command: GetWalletCommand): Promise<GetWalletResult> {
    const wallet = await this.walletRepository.findById(command.walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found: ${command.walletId}`);
    }
    return { wallet };
  }
}
