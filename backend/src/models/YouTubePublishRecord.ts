import { Column, DataType, Default, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './User';
import { EditorProject } from './EditorProject';
import { MediaJob } from './MediaJob';

@Table({ tableName: 'youtube_publish_records', timestamps: true, underscored: true })
export class YouTubePublishRecord extends Model<YouTubePublishRecord> {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  userEmail!: string;

  @ForeignKey(() => EditorProject)
  @Column({ type: DataType.INTEGER, allowNull: true })
  projectId!: number | null;

  @ForeignKey(() => MediaJob)
  @Column({ type: DataType.STRING(64), allowNull: true })
  mediaJobId!: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  videoId?: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  videoUrl?: string | null;

  @Column({ type: DataType.STRING(120), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  description!: string;

  @Default('private')
  @Column({ type: DataType.ENUM('private', 'unlisted', 'public'), allowNull: false })
  privacyStatus!: 'private' | 'unlisted' | 'public';

  @Column({ type: DataType.STRING(128), allowNull: true })
  channelId?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  channelTitle?: string | null;

  @Default('published')
  @Column({ type: DataType.ENUM('uploading', 'published', 'failed'), allowNull: false })
  status!: 'uploading' | 'published' | 'failed';

  @Column({ type: DataType.TEXT, allowNull: true })
  errorMessage?: string | null;

  @Default({})
  @Column({ type: DataType.JSON, allowNull: false })
  metadata!: Record<string, unknown>;
}
