import { ArtifactClient } from './internal/client'
import { VolcArtifactClient } from './internal/volc-client'

export * from './internal/shared/interfaces'
export * from './internal/shared/errors'
export * from './internal/client'

const client: ArtifactClient = new VolcArtifactClient()
export default client
