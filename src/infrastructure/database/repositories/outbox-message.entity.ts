import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

@Entity({ tableName: "outbox_messages", schema: "jungle" })
@Index({ properties: ["nextAttemptAt", "publishedAt"] })
@Index({ properties: ["aggregateId"] })
@Index({ properties: ["eventType"] })
export class OutboxMessageEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  aggregateId!: string;

  @Property({ type: "string", length: 100 })
  eventType!: string;

  @Property({ type: "int" })
  eventVersion!: number;

  @Property({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Property({ type: "Date", onCreate: () => new Date() })
  occurredAt!: Date;

  @Property({ type: "int", default: 0 })
  attempts!: number;

  @Property({ type: "Date", nullable: true })
  nextAttemptAt?: Date;

  @Property({ type: "Date", nullable: true })
  publishedAt?: Date;
}
