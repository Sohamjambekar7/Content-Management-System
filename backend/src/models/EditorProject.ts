import { Column, DataType, Default, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './User';

@Table({ tableName: 'editor_projects', timestamps: true, underscored: true })
export class EditorProject extends Model<EditorProject> {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(160), allowNull: false })
  name!: string;

  @Column({ type: DataType.ENUM('photo', 'video'), allowNull: false })
  mediaType!: 'photo' | 'video';

  @Default({})
  @Column({ type: DataType.JSON, allowNull: false })
  metadata!: Record<string, unknown>;
}
