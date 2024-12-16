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
import * as core from '@actions/core'
import * as fs from 'fs'
import {realpath} from 'fs/promises'
import * as archiver from 'archiver'
import {getBackendIdsFromToken} from './shared/util'
import { start } from 'repl'

const BUCKET = process.env["BUCKET_NAME"];
const REPO = process.env["GITHUB_REPOSITORY"];
const ENDPOINT = process.env["PUBLIC_ENDPOINT"];

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

export const DEFAULT_COMPRESSION_LEVEL = 6
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zipErrorCallback = (error: any): void => {
  core.error('An error has occurred while creating the zip file for upload')
  core.info(error)

  throw new Error('An error has occurred during zip creation for the artifact')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zipWarningCallback = (error: any): void => {
  if (error.code === 'ENOENT') {
    core.warning(
      'ENOENT warning during artifact zip creation. No such file or directory'
    )
    core.info(error)
  } else {
    core.warning(
      `A non-blocking warning has occurred during artifact zip creation: ${error.code}`
    )
    core.info(error)
  }
}

const zipFinishCallback = (): void => {
  core.debug('Zip stream for upload has finished.')
}

const zipEndCallback = (): void => {
  core.debug('Zip stream for upload has ended.')
}

async function archive(
  name: string,
  uploadSpecification: UploadZipSpecification[],
  compressionLevel: number = DEFAULT_COMPRESSION_LEVEL
): Promise<number> {
  core.debug(
    `Creating Artifact archive with compressionLevel: ${compressionLevel}`
  )

  const zip = archiver.create('zip', {
    zlib: {level: compressionLevel}
  });

  // register callbacks for various events during the zip lifecycle
  zip.on('error', zipErrorCallback)
  zip.on('warning', zipWarningCallback)
  zip.on('finish', zipFinishCallback)
  zip.on('end', zipEndCallback)

  for (const file of uploadSpecification) {
    if (file.sourcePath !== null) {
      // Check if symlink and resolve the source path
      let sourcePath = file.sourcePath
      if (file.stats.isSymbolicLink()) {
        sourcePath = await realpath(file.sourcePath)
      }

      // Add the file to the zip
      zip.file(sourcePath, {
        name: file.destinationPath
      })
    } else {
      // Add a directory to the zip
      zip.append('', {name: file.destinationPath})
    }
  }

  const stream = fs.createWriteStream(name);
  zip.pipe(stream)
  await zip.finalize()
  stream.end();

  return zip.pointer();
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

  const backendIds = getBackendIdsFromToken();

  const client = await createObjectStorageClient();
  const fileName = `${name}-${backendIds.workflowRunBackendId}-${backendIds.workflowJobRunBackendId}.zip`;
  const objectName = `artifacts/${REPO}/${fileName}`;
  
  const size = await archive(`${rootDirectory}/${fileName}`, zipSpecification);

  await client.putObjectFromFile({
    bucket: BUCKET,
    key: objectName,
    filePath: fileName,
    headers: {
      'content-length': size.toString()
    }
  });

  return {
    size: size,
    url: `https://${BUCKET}.${ENDPOINT}/artifacts/${REPO}/${fileName}`
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
