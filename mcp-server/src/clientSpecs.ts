/**
 * Client specs — the server's record of what the host app (PPTist) told it about
 * itself through the SchemaSupplier. Ingesting specs moves the server from
 * `bootstrap` mode to `operational` mode (see dynamicTools.ts).
 */

import { z } from 'zod'
import type { ClientSpecs } from '@pptist/sdk'

export const ClientSpecsSchema = z.object({
  appName: z.string().min(1),
  appVersion: z.string(),
  documentation: z.string(),
  capabilities: z.array(z.string()),
  schemas: z.record(z.record(z.unknown())),
  actions: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string(),
      description: z.string(),
      applicableTo: z.array(z.string()),
      argsSchema: z.record(z.unknown()).optional(),
    }),
  ),
})

// Compile-time guarantee that the runtime schema matches the SDK contract.
type _SpecsContractCheck = z.infer<typeof ClientSpecsSchema> extends ClientSpecs ? true : never
export const _specsContractCheck: _SpecsContractCheck = true

export type ServerMode = 'bootstrap' | 'operational'

interface SpecsState {
  specs: ClientSpecs | null
  ingestedAt: number | null
  ingestCount: number
}

const state: SpecsState = { specs: null, ingestedAt: null, ingestCount: 0 }

export function setClientSpecs(specs: ClientSpecs): void {
  state.specs = specs
  state.ingestedAt = Date.now()
  state.ingestCount++
}

export function getClientSpecs(): ClientSpecs | null {
  return state.specs
}

export function getServerMode(): ServerMode {
  return state.specs ? 'operational' : 'bootstrap'
}

export function getSpecsStatus(): { mode: ServerMode; app: string | null; ingestedAt: string | null; ingestCount: number } {
  return {
    mode: getServerMode(),
    app: state.specs ? `${state.specs.appName}@${state.specs.appVersion}` : null,
    ingestedAt: state.ingestedAt ? new Date(state.ingestedAt).toISOString() : null,
    ingestCount: state.ingestCount,
  }
}
