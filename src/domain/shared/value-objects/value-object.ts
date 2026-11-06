export abstract class ValueObject<Props extends object> {
  protected readonly props: Props;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  public equals(other: ValueObject<Props>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.props === undefined) {
      return false;
    }
    return this.propsEqual(this.props, other.props);
  }

  private propsEqual(a: Props, b: Props): boolean {
    const keys = Object.keys(a) as Array<keyof Props>;
    return keys.every((key) => {
      const valA = a[key];
      const valB = b[key];
      if (valA instanceof ValueObject && valB instanceof ValueObject) {
        return valA.equals(valB);
      }
      if (Array.isArray(valA) && Array.isArray(valB)) {
        return (
          valA.length === valB.length &&
          valA.every(
            (v, i) =>
              v === valB[i] || (v instanceof ValueObject && v.equals(valB[i])),
          )
        );
      }
      return valA === valB;
    });
  }

  public toJSON(): Props {
    return { ...this.props };
  }
}
