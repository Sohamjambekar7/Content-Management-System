import { Column, DataType, Default, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './User';
import { EditorProject } from './EditorProject';

export type MediaJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type MediaJobType =
  | 'photo-render'
  | 'photo-ai-enhance'
  | 'video-render'
  | 'video-smart-trim'
  | 'video-highlights'
  | 'video-auto-caption';

@Table({ tableName: 'media_jobs', timestamps: true, underscored: true })
export class MediaJob extends Model<MediaJob> {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => EditorProject)
  @Column({ type: DataType.INTEGER, allowNull: true })
  projectId!: number | null;

  @Column({ type: DataType.ENUM('photo', 'video'), allowNull: false })
  mediaType!: 'photo' | 'video';

  @Column({ type: DataType.STRING(48), allowNull: false })
  jobType!: MediaJobType;

  @Default('queued')
  @Column({
    type: DataType.ENUM('queued', 'processing', 'completed', 'failed', 'cancelled'),
    allowNull: false,
  })
  status!: MediaJobStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  progress!: number;

  @Default('Queued for processing')
  @Column({ type: DataType.STRING(160), allowNull: false })
  stage!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  originalFileName?: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  inputPath?: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  outputPath?: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true })
  outputMimeType?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  width?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  height?: number | null;

  @Column({ type: DataType.DECIMAL(10, 3), allowNull: true })
  durationSeconds?: number | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  fileSizeBytes?: number | null;

  @Default({})
  @Column({ type: DataType.JSON, allowNull: false })
  options!: Record<string, unknown>;

  @Default({})
  @Column({ type: DataType.JSON, allowNull: false })
  resultMetadata!: Record<string, unknown>;

  @Column({ type: DataType.TEXT, allowNull: true })
  errorMessage?: string | null;
}
