import { Entity, PrimaryKey, Property, Unique, Index } from "@mikro-orm/core";

@Entity({ tableName: "inbox_messages", schema: "jungle" })
@Unique({ properties: ["consumerName", "messageId"] })
@Index({ properties: ["consumerName", "processedAt"] })
export class InboxMessageEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", length: 200 })
  messageId!: string;

  @Property({ type: "string", length: 100 })
  consumerName!: string;

  @Property({ type: "string", length: 64 })
  payloadHash!: string;

  @Property({ type: "Date", onCreate: () => new Date() })
  receivedAt!: Date;

  @Property({ type: "Date", nullable: true })
  processedAt?: Date;
}
