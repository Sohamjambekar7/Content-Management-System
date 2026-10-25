import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './User';
import { EditorProject } from './EditorProject';

@Table({ tableName: 'export_history', timestamps: true, updatedAt: false, underscored: true })
export class ExportHistory extends Model<ExportHistory> {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => EditorProject)
  @Column({ type: DataType.INTEGER, allowNull: true })
  projectId!: number | null;

  @Column({ type: DataType.STRING(24), allowNull: false })
  format!: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  width?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  height?: number;

  @Column({ type: DataType.DECIMAL(10, 3), allowNull: true })
  durationSeconds?: number;

  @Column({ type: DataType.STRING(40), allowNull: true })
  platform?: string;

  @Column({ type: DataType.JSON, allowNull: false, defaultValue: {} })
  metadata!: Record<string, unknown>;
}
