export type ScannerCategory = 'brew' | 'apple' | 'toolchain' | 'ai-tools' | 'network' | 'permission' | 'system';

/** 错误类型分类（标准化二级分类，提升匹配精度） */
export type ErrorType =
  | 'missing'        // 工具未安装
  | 'outdated'       // 版本过旧
  | 'conflict'       // 版本/配置冲突
  | 'misconfigured'  // 配置错误
  | 'incompatible'   // 硬件/驱动不兼容
  | 'permission'     // 权限不足
  | 'network'        // 网络问题
  | 'resource'       // 资源不足（显存/磁盘/内存）
  | 'unknown';       // 无法判定

export interface ScanResult {
  id: string;
  name: string;
  category: ScannerCategory;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  message: string;
  details?: string;
  suggestions?: string[];
  error_type?: ErrorType;
}

export type ScannerResult = ScanResult;

export interface Scanner {
  id: string;
  name: string;
  category: ScannerCategory;
  scan(): Promise<ScannerResult>;
}
