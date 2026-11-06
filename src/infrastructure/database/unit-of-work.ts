import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type { UnitOfWork } from "../../application/ports/unit-of-work";

@Injectable()
export class DatabaseUnitOfWork implements UnitOfWork {
  constructor(private readonly em: EntityManager) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.em.fork().transactional(async (em) => {
      await em.execute("set local lock_timeout = '5s'");
      return work();
    });
  }
}
