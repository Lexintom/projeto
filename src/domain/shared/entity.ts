import { ValueObject } from "../shared/value-objects/value-object";

export interface EntityProps {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class Entity<Props extends { id: string }> {
  protected readonly _props: Props;

  protected constructor(props: Props) {
    this._props = props;
  }

  get id(): string {
    return this._props.id;
  }

  public equals(other: Entity<Props>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this.id === other.id;
  }

  protected get props(): Props {
    return this._props;
  }
}
