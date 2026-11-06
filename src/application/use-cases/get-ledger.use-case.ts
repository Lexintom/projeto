import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WalletLedgerEntry } from "../../domain/ledger/wallet-ledger-entry";
import type { LedgerRepository } from "../../domain/ledger/ledger.repository.interface";
import type { WalletRepository } from "../../domain/wallet/wallet.repository.interface";

export interface GetLedgerCommand {
  walletId: string;
  cursor?: string;
  limit: number;
}

export interface GetLedgerResult {
  entries: WalletLedgerEntry[];
  nextCursor?: string;
}

export class GetLedgerUseCase {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(command: GetLedgerCommand): Promise<GetLedgerResult> {
    const wallet = await this.walletRepository.findById(command.walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found: ${command.walletId}`);
    }

    let anchor: string | undefined;
    if (command.cursor) {
      anchor = Buffer.from(command.cursor, "base64url").toString("utf8");
      if (!/^[0-9a-f-]{36}$/.test(anchor))
        throw new BadRequestException("Invalid cursor");
    }
    const entries = await this.ledgerRepository.findByWalletId(
      command.walletId,
      anchor,
      command.limit,
    );

    const nextCursor =
      entries.length === command.limit
        ? Buffer.from(entries[entries.length - 1]!.id).toString("base64url")
        : undefined;

    return { entries, nextCursor };
  }
}
