/**
 * Shared service singletons
 * Import services from here to ensure single instances are used across the application
 */

import { TmuxService } from './TmuxService'
import { RalphWatcher } from './RalphWatcher'
import { SystemMonitor } from './SystemMonitor'
import { ContainerManager, containerManager } from './ContainerManager'
import { TerminalManager, terminalManager } from './TerminalManager'
import { RemoteTmuxService, remoteTmuxService } from './RemoteTmuxService'
import { RemoteRalphService, remoteRalphService } from './RemoteRalphService'
import { RemoteExecService, remoteExecService } from './RemoteExecService'

// Create singletons for services that don't export their own
const tmuxService = new TmuxService()
const ralphWatcher = new RalphWatcher()
const systemMonitor = new SystemMonitor()

export {
  // Singleton instances
  tmuxService,
  ralphWatcher,
  systemMonitor,
  containerManager,
  terminalManager,
  remoteTmuxService,
  remoteRalphService,
  remoteExecService,
  // Classes (for typing)
  TmuxService,
  RalphWatcher,
  SystemMonitor,
  ContainerManager,
  TerminalManager,
  RemoteTmuxService,
  RemoteRalphService,
  RemoteExecService,
}
