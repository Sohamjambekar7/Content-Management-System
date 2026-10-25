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

export const connection = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  models: [User, Post, Category, Tag, Comment, Token, PostTag, EditorProject, ExportHistory],
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});
