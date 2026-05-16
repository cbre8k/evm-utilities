export type ContractSourceFile = {
  name: string;
  path: string;
  content: string;
};

export type ContractSourceBundle = {
  address: string;
  contractName: string | null;
  compilerVersion?: string;
  sources: ContractSourceFile[];
};

export type SourceSelection = {
  address: string;
  file?: ContractSourceFile;
  line?: number;
  start?: number;
  length?: number;
  opcode?: string;
  pc?: number;
};
