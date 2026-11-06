import { NotFoundException } from "@nestjs/common";
import { WagerTransaction } from "../../domain/transaction/wager-transaction";
import type { WagerTransactionRepository } from "../../domain/transaction/wager-transaction.repository.interface";

export interface GetTransactionCommand {
  transactionId?: string;
  providerId?: string;
  externalTransactionId?: string;
}

export interface GetTransactionResult {
  transaction: WagerTransaction;
}

export class GetTransactionUseCase {
  constructor(
    private readonly transactionRepository: WagerTransactionRepository,
  ) {}

  async execute(command: GetTransactionCommand): Promise<GetTransactionResult> {
    let transaction: WagerTransaction | null = null;

    if (command.transactionId) {
      transaction = await this.transactionRepository.findById(
        command.transactionId,
      );
    } else if (command.providerId && command.externalTransactionId) {
      transaction =
        await this.transactionRepository.findByProviderAndExternalId(
          command.providerId,
          command.externalTransactionId,
        );
    } else {
      throw new Error(
        "Either transactionId or providerId+externalTransactionId must be provided",
      );
    }

    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    return { transaction };
  }
}
