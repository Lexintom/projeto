import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";
import { InboxMessage } from "../../../domain/inbox/inbox-message";
import type { InboxRepository } from "../../../domain/inbox/inbox.repository.interface";
import { InboxMessageEntity } from "./inbox-message.entity";

@Injectable()
export class InboxRepositoryImpl implements InboxRepository {
  constructor(
    @InjectRepository(InboxMessageEntity)
    private readonly repo: EntityRepository<InboxMessageEntity>,
    private readonly em: EntityManager,
  ) {}

  async findByMessageIdAndConsumer(
    messageId: string,
    consumerName: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.repo.findOne({ messageId, consumerName });
    return entity ? this.toDomain(entity) : null;
  }

  async save(message: InboxMessage): Promise<void> {
    await this.em.upsert(InboxMessageEntity, this.toEntity(message));
  }

  async exists(messageId: string, consumerName: string): Promise<boolean> {
    const count = await this.repo.count({ messageId, consumerName });
    return count > 0;
  }

  private toDomain(entity: InboxMessageEntity): InboxMessage {
    return InboxMessage.rehydrate({
      id: entity.id,
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt ?? null,
    });
  }

  private toEntity(message: InboxMessage): InboxMessageEntity {
    return {
      id: message.id,
      messageId: message.messageId,
      consumerName: message.consumerName,
      payloadHash: message.payloadHash,
      receivedAt: message.receivedAt,
      processedAt: message.processedAt,
    };
  }
}
