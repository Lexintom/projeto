import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository, LockMode } from "@mikro-orm/core";
import { OutboxMessage } from "../../../domain/outbox/outbox-message";
import type { OutboxRepository } from "../../../domain/outbox/outbox.repository.interface";
import { OutboxMessageEntity } from "./outbox-message.entity";

@Injectable()
export class OutboxRepositoryImpl implements OutboxRepository {
  constructor(
    @InjectRepository(OutboxMessageEntity)
    private readonly repo: EntityRepository<OutboxMessageEntity>,
    private readonly em: EntityManager,
  ) {}

  async findPending(limit: number, now: Date): Promise<OutboxMessage[]> {
    const entities = await this.repo.find(
      {
        $or: [
          { nextAttemptAt: { $lte: now }, publishedAt: null },
          { nextAttemptAt: null, publishedAt: null, attempts: 0 },
        ],
      },
      {
        limit,
        orderBy: { occurredAt: "ASC", id: "ASC" },
        lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
      },
    );
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string): Promise<OutboxMessage | null> {
    const entity = await this.repo.findOne({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async save(message: OutboxMessage): Promise<void> {
    await this.em.upsert(OutboxMessageEntity, this.toEntity(message));
  }

  async saveAll(messages: OutboxMessage[]): Promise<void> {
    const entities = messages.map((m) => this.repo.create(this.toEntity(m)));
    await this.em.persistAndFlush(entities);
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.em.execute(
      `UPDATE jungle.outbox_messages
       SET published_at = ?, next_attempt_at = null
       WHERE id = ?`,
      [publishedAt, id],
    );
  }

  private toDomain(entity: OutboxMessageEntity): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      eventVersion: entity.eventVersion,
      payload: entity.payload,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt: entity.nextAttemptAt ?? null,
      publishedAt: entity.publishedAt ?? null,
    });
  }

  private toEntity(message: OutboxMessage): OutboxMessageEntity {
    return {
      id: message.id,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      eventVersion: message.eventVersion,
      payload: message.payload,
      occurredAt: message.occurredAt,
      attempts: message.attempts,
      nextAttemptAt: message.nextAttemptAt,
      publishedAt: message.publishedAt,
    };
  }
}
