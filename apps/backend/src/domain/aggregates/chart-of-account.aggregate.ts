export interface ChartOfAccountProps {
  tenantId: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentId?: string;
  isActive: boolean;
}

export class ChartOfAccount {
  constructor(
    public readonly props: ChartOfAccountProps,
    public readonly id?: string,
  ) {}

  get tenantId() {
    return this.props.tenantId;
  }

  get code() {
    return this.props.code;
  }

  get name() {
    return this.props.name;
  }

  get type() {
    return this.props.type;
  }

  get parentId() {
    return this.props.parentId;
  }

  get isActive() {
    return this.props.isActive;
  }

  static create(props: ChartOfAccountProps, id?: string) {
    return new ChartOfAccount(props, id);
  }
}