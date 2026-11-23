import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/**
 * OpenAPI 3.1 sözleşmesini farklı çalışma dizinlerinde (dev, dist, Docker)
 * bulabilmek için bilinen konumları sırayla dener.
 */
export function loadOpenApiDocument(): Record<string, unknown> | null {
  const candidates = [
    path.resolve(process.cwd(), 'docs/api/openapi.yaml'),
    path.resolve(process.cwd(), '../docs/api/openapi.yaml'),
    path.resolve(__dirname, '../../../../docs/api/openapi.yaml'),
    path.resolve(__dirname, '../../../docs/api/openapi.yaml'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return YAML.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
    }
  }

  return null;
}
