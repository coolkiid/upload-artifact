import {warning} from '@actions/core'
import {isGhes} from './shared/config'
import {
  UploadArtifactOptions,
  UploadArtifactResponse,
  DownloadArtifactOptions,
  GetArtifactResponse,
  ListArtifactsOptions,
  ListArtifactsResponse,
  DownloadArtifactResponse,
  FindOptions,
  DeleteArtifactResponse
} from './shared/interfaces'
// import {uploadArtifact} from './upload/upload-artifact'
// import {
//   downloadArtifactPublic,
//   downloadArtifactInternal
// } from './download/download-artifact'
// import {
//   deleteArtifactPublic,
//   deleteArtifactInternal
// } from './delete/delete-artifact'
// import {getArtifactPublic, getArtifactInternal} from './find/get-artifact'
// import {listArtifactsPublic, listArtifactsInternal} from './find/list-artifacts'
import {GHESNotSupportedError} from './shared/errors'

import { ArtifactClient } from './client'
import { TosClient, TosClientError, TosServerError } from "@volcengine/tos-sdk";
import {validateArtifactName} from './upload/path-and-artifact-name-validation'
import {
  UploadZipSpecification,
  getUploadZipSpecification,
  validateRootDirectory
} from './upload/upload-zip-specification'

import {FilesNotFoundError, InvalidResponseError} from './shared/errors'
import {exec} from '@actions/exec'

const BUCKET = process.env["BUCKET_NAME"];
const REPO = process.env["GITHUB_REPOSITORY"];

async function createObjectStorageClient(): Promise<TosClient> {
  const endpoint = process.env["ENDPOINT"];
  const opts = endpoint
      ? { endpoint: endpoint, secure: false }
      : { secure: true };

  return new TosClient({
      accessKeyId: process.env["ACCESS_KEY"] as string,
      accessKeySecret: process.env["SECRET_KEY"] as string,
      region: process.env["REGION"] as string,
      ...opts
  });
}

async function uploadArtifact(
  name: string,
  files: string[],
  rootDirectory: string,
  options?: UploadArtifactOptions | undefined
): Promise<UploadArtifactResponse> {
  validateArtifactName(name)
  validateRootDirectory(rootDirectory)

  const zipSpecification: UploadZipSpecification[] = getUploadZipSpecification(
    files,
    rootDirectory
  )
  if (zipSpecification.length === 0) {
    throw new FilesNotFoundError(
      zipSpecification.flatMap(s => (s.sourcePath ? [s.sourcePath] : []))
    )
  }

  const client = await createObjectStorageClient();
  const objectName = `artifacts/${REPO}/${name}.zip`;
  const archivePath = `${name}.zip`
  console.warn(`rootDirectory = ${rootDirectory}`)
  await exec(`zip ${archivePath} ${files.join(' ')}`, undefined, {
    cwd: rootDirectory
  });

  await client.putObjectFromFile({
    bucket: BUCKET,
    key: objectName,
    filePath: archivePath
  });

  return {
    size: 0,
    id: 0
  }
}

export class VolcArtifactClient implements ArtifactClient {
  async uploadArtifact(
    name: string,
    files: string[],
    rootDirectory: string,
    options?: UploadArtifactOptions
  ): Promise<UploadArtifactResponse> {
    try {
      if (isGhes()) {
        throw new GHESNotSupportedError()
      }

      return uploadArtifact(name, files, rootDirectory, options)
    } catch (error) {
      warning(
        `Artifact upload failed with error: ${error}.

Errors can be temporary, so please try again and optionally run the action with debug mode enabled for more information.

If the error persists, please check whether Actions is operating normally at [https://githubstatus.com](https://www.githubstatus.com).`
      )

      throw error
    }
  }

  async downloadArtifact(
    artifactId: number,
    options?: DownloadArtifactOptions & FindOptions
  ): Promise<DownloadArtifactResponse> {
    try {
      if (isGhes()) {
        throw new GHESNotSupportedError()
      }

      if (options?.findBy) {
        const {
          findBy: {repositoryOwner, repositoryName, token},
          ...downloadOptions
        } = options

        // return downloadArtifactPublic(
        //   artifactId,
        //   repositoryOwner,
        //   repositoryName,
        //   token,
        //   downloadOptions
        // )
      }

      // return downloadArtifactInternal(artifactId, options)
      return {
        downloadPath: ''
      }
    } catch (error) {
      warning(
        `Download Artifact failed with error: ${error}.

Errors can be temporary, so please try again and optionally run the action with debug mode enabled for more information.

If the error persists, please check whether Actions and API requests are operating normally at [https://githubstatus.com](https://www.githubstatus.com).`
      )

      throw error
    }
  }

  async listArtifacts(
    options?: ListArtifactsOptions & FindOptions
  ): Promise<ListArtifactsResponse> {
    try {
      if (isGhes()) {
        throw new GHESNotSupportedError()
      }

      if (options?.findBy) {
        const {
          findBy: {workflowRunId, repositoryOwner, repositoryName, token}
        } = options

        // return listArtifactsPublic(
        //   workflowRunId,
        //   repositoryOwner,
        //   repositoryName,
        //   token,
        //   options?.latest
        // )
      }

      // return listArtifactsInternal(options?.latest)
      return {
        artifacts: []
      }
    } catch (error: unknown) {
      warning(
        `Listing Artifacts failed with error: ${error}.

Errors can be temporary, so please try again and optionally run the action with debug mode enabled for more information.

If the error persists, please check whether Actions and API requests are operating normally at [https://githubstatus.com](https://www.githubstatus.com).`
      )

      throw error
    }
  }

  async getArtifact(
    artifactName: string,
    options?: FindOptions
  ): Promise<GetArtifactResponse> {
    try {
      if (isGhes()) {
        throw new GHESNotSupportedError()
      }

      if (options?.findBy) {
        const {
          findBy: {workflowRunId, repositoryOwner, repositoryName, token}
        } = options

        // return getArtifactPublic(
        //   artifactName,
        //   workflowRunId,
        //   repositoryOwner,
        //   repositoryName,
        //   token
        // )
      }

      // return getArtifactInternal(artifactName)
      return {
        artifact: {
          name: '',
          id: 0,
          size: 0
        }
      }
    } catch (error: unknown) {
      warning(
        `Get Artifact failed with error: ${error}.

Errors can be temporary, so please try again and optionally run the action with debug mode enabled for more information.

If the error persists, please check whether Actions and API requests are operating normally at [https://githubstatus.com](https://www.githubstatus.com).`
      )
      throw error
    }
  }

  async deleteArtifact(
    artifactName: string,
    options?: FindOptions
  ): Promise<DeleteArtifactResponse> {
    try {
      if (isGhes()) {
        throw new GHESNotSupportedError()
      }

      if (options?.findBy) {
        const {
          findBy: {repositoryOwner, repositoryName, workflowRunId, token}
        } = options

        // return deleteArtifactPublic(
        //   artifactName,
        //   workflowRunId,
        //   repositoryOwner,
        //   repositoryName,
        //   token
        // )
      }

      // return deleteArtifactInternal(artifactName)
      return {
        id: 0
      }
    } catch (error) {
      warning(
        `Delete Artifact failed with error: ${error}.

Errors can be temporary, so please try again and optionally run the action with debug mode enabled for more information.

If the error persists, please check whether Actions and API requests are operating normally at [https://githubstatus.com](https://www.githubstatus.com).`
      )

      throw error
    }
  }
}
