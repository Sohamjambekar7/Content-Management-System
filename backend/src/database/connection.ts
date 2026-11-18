import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { Category } from '../models/Category';
import { Tag } from '../models/Tag';
import { Comment } from '../models/Comment';
import { Token } from '../models/Token';
import { PostTag } from '../models/PostTag';
import { EditorProject } from '../models/EditorProject';
import { ExportHistory } from '../models/ExportHistory';
import { MediaJob } from '../models/MediaJob';
import { YouTubeAccount } from '../models/YouTubeAccount';
import { YouTubePublishRecord } from '../models/YouTubePublishRecord';
import logger from '../shared/logger.util';

export const connection = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'easecontent',
  port: Number(process.env.DB_PORT || 3306),
  models: [
    User,
    Post,
    Category,
    Tag,
    Comment,
    Token,
    PostTag,
    EditorProject,
    ExportHistory,
    MediaJob,
    YouTubeAccount,
    YouTubePublishRecord,
  ],
  logging:
    process.env.DB_LOGGING === 'true'
      ? (sql: string) => logger.debug('SQL query', { sql })
      : false,
  pool: {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: Number(process.env.DB_POOL_MIN || 0),
    acquire: 30000,
    idle: 10000,
  },
});
