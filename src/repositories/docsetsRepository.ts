import { Db } from 'mongodb';
import { BaseRepository } from './baseRepository';
import { ILogger } from '../services/logger';
import { IConfig } from 'config';

export class DocsetsRepository extends BaseRepository {
  constructor(db: Db, config: IConfig, logger: ILogger) {
    super(config, logger, 'DocsetsRepository', db.collection(config.get('docsetsCollection')));
  }

  private getAggregationPipeline(
    matchConditionField: string,
    matchConditionValue: string,
    projection?: { [k: string]: number }
  ) {
    return [
      // Stage 1: Unwind the repos array to create multiple documents for each referenced repo
      {
        $unwind: '$repos',
      },
      // Stage 2: Lookup to join with the repos_branches collection
      {
        $lookup: {
          from: 'repos_branches',
          localField: 'repos',
          foreignField: '_id',
          as: 'repo',
        },
      },
      // Stage 3: Match documents based on given field
      {
        $match: {
          [`repo.${matchConditionField}`]: matchConditionValue,
        },
      },
      // Stage 4: Merge/flatten repo into docset
      {
        $replaceRoot: { newRoot: { $mergeObjects: [{ $arrayElemAt: ['$repo', 0] }, '$$ROOT'] } },
      },
      // Stage 5: Exclude fields
      {
        $project: projection || {
          _id: 0,
          repos: 0,
          repo: 0,
        },
      },
    ];
  }

  async getProjectByRepoName(repoName: string) {
    const projection = { project: 1 };
    const aggregationPipeline = this.getAggregationPipeline('repoName', repoName, projection);
    const cursor = await this.aggregate(aggregationPipeline, `Error while getting project by repo name ${repoName}`);
    const res = await cursor.toArray();
    if (!res.length) {
      const msg = `DocsetsRepository.getProjectByRepoName - Could not find project by repoName: ${repoName}`;
      this._logger.info(this._repoName, msg);
    }
    return res[0].project;
  }

  async getRepo(repoName: string): Promise<any> {
    const aggregationPipeline = this.getAggregationPipeline('repoName', repoName);
    const cursor = await this.aggregate(aggregationPipeline, `Error while fetching repo by repo name ${repoName}`);
    const res = await cursor.toArray();
    if (!res.length) {
      const msg = `DocsetsRepository.getRepo - Could not find repo by repoName: ${repoName}`;
      this._logger.info(this._repoName, msg);
    }
    return res[0];
  }

  async getRepoBranchesByRepoName(repoName: string): Promise<any> {
    const aggregationPipeline = this.getAggregationPipeline('repoName', repoName);
    const cursor = await this.aggregate(aggregationPipeline, `Error while fetching repo by repo name ${repoName}`);
    if (cursor) {
      const res = await cursor.toArray();
      if (res.length && res[0]?.bucket && res[0]?.url) {
        return res[0];
      }
    }
    return { status: 'failure' };
  }

  /**
   * Compares the project path from a monorepo push event, and compares it with
   * what is configured in the docset entry in Atlas.
   * @param path The project path where the snooty.toml file exists from the monorepo.
   * This path will reflect the current project path from a given commit.
   * @param projectName The project name for the docset entry.
   * @returns A boolean representing whether or not the configured docset entry snooty_toml path
   * matches the path found in GitHub.
   */
  async checkSnootyTomlPath(path: string, projectName: string) {
    const query = { project: projectName };
    try {
      const docsetObject = await this.findOne(
        query,
        `Mongo Timeout Error: Timedout while retrieving repos entry for ${path}`
      );

      if (!docsetObject) {
        console.warn(`WARNING: The docset does not exist for the following project: ${projectName} \n path: ${path}`);

        return false;
      }

      return docsetObject.directories.snooty_toml === path;
    } catch (error) {
      console.warn(
        `WARNING: Error occurred when retrieving project path for ${projectName}. The following path was provided: ${path}`,
        error
      );
      return false;
    }
  }
}
