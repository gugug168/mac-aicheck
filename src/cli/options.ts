export function shouldUploadScan(args: string[]): boolean {
  return args.includes('--upload') || args.includes('upload');
}
