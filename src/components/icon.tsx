import type { ComponentType, CSSProperties, JSX } from 'react'
import {
  AimOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  BookOutlined,
  BorderOutlined,
  CalendarOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CompressOutlined,
  CopyOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExpandAltOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  GithubOutlined,
  HistoryOutlined,
  HolderOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  LineChartOutlined,
  LinkOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined,
  PlusOutlined,
  ReadOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  SlidersOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  StarOutlined,
  StockOutlined,
  SyncOutlined,
  TagOutlined,
  TransactionOutlined,
  UploadOutlined,
  UserOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'

export type IconName =
  | 'Tag'
  | 'Transaction'
  | 'Dashboard'
  | 'LineChart'
  | 'Stock'
  | 'Star'
  | 'Read'
  | 'Setting'
  | 'Book'
  | 'Up'
  | 'Down'
  | 'Plus'
  | 'Trash'
  | 'Sync'
  | 'SortAsc'
  | 'SortDesc'
  | 'Search'
  | 'Close'
  | 'CheckCircle'
  | 'CloseCircle'
  | 'WarningCircle'
  | 'InfoCircle'
  | 'Inbox'
  | 'Loading'
  | 'Left'
  | 'Right'
  | 'Calendar'
  | 'ClockCircle'
  | 'Check'
  | 'Edit'
  | 'Download'
  | 'Reload'
  | 'CaretRight'
  | 'ChevronRight'
  | 'ChevronLeft'
  | 'Link'
  | 'Upload'
  | 'FileText'
  | 'BarChart'
  | 'ZoomIn'
  | 'ZoomOut'
  | 'Aim'
  | 'Shrink'
  | 'Expand'
  | 'Fullscreen'
  | 'History'
  | 'MenuFold'
  | 'MenuUnfold'
  | 'WindowMinimize'
  | 'WindowMaximize'
  | 'WindowRestore'
  | 'DragHandle'
  | 'GitHub'
  | 'User'
  | 'Sliders'

type IconComponent = ComponentType<{
  className?: string
  style?: CSSProperties
  'aria-hidden'?: boolean | 'true' | 'false'
}>

const ICONS: Record<IconName, IconComponent> = {
  Tag: TagOutlined,
  Transaction: TransactionOutlined,
  Dashboard: DashboardOutlined,
  LineChart: LineChartOutlined,
  Stock: StockOutlined,
  Star: StarOutlined,
  Read: ReadOutlined,
  Setting: SettingOutlined,
  Book: BookOutlined,
  Up: ArrowUpOutlined,
  Down: DownOutlined,
  Plus: PlusOutlined,
  Trash: DeleteOutlined,
  Sync: SyncOutlined,
  SortAsc: SortAscendingOutlined,
  SortDesc: SortDescendingOutlined,
  Search: SearchOutlined,
  Close: CloseOutlined,
  CheckCircle: CheckCircleOutlined,
  CloseCircle: CloseCircleOutlined,
  WarningCircle: ExclamationCircleOutlined,
  InfoCircle: InfoCircleOutlined,
  Inbox: InboxOutlined,
  Loading: LoadingOutlined,
  Left: LeftOutlined,
  Right: RightOutlined,
  Calendar: CalendarOutlined,
  ClockCircle: ClockCircleOutlined,
  Check: CheckOutlined,
  Edit: EditOutlined,
  Download: DownloadOutlined,
  Reload: ReloadOutlined,
  CaretRight: CaretRightOutlined,
  ChevronRight: RightOutlined,
  ChevronLeft: LeftOutlined,
  Link: LinkOutlined,
  Upload: UploadOutlined,
  FileText: FileTextOutlined,
  BarChart: BarChartOutlined,
  ZoomIn: ZoomInOutlined,
  ZoomOut: ZoomOutOutlined,
  Aim: AimOutlined,
  Shrink: CompressOutlined,
  Expand: ExpandAltOutlined,
  Fullscreen: FullscreenOutlined,
  History: HistoryOutlined,
  MenuFold: MenuFoldOutlined,
  MenuUnfold: MenuUnfoldOutlined,
  WindowMinimize: MinusOutlined,
  WindowMaximize: BorderOutlined,
  WindowRestore: CopyOutlined,
  DragHandle: HolderOutlined,
  GitHub: GithubOutlined,
  User: UserOutlined,
  Sliders: SlidersOutlined,
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
}

/** 统一图标出口：底层全部由 @ant-design/icons 渲染。 */
export function Icon({ name, size = 16, className }: IconProps): JSX.Element {
  const Component = ICONS[name]
  return (
    <Component
      className={`icon${className ? ` ${className}` : ''}`}
      style={{ fontSize: size }}
      aria-hidden="true"
    />
  )
}

