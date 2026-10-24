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
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExpandAltOutlined,
  FileTextOutlined,
  FilterOutlined,
  FullscreenOutlined,
  GithubOutlined,
  HistoryOutlined,
  HolderOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  LineChartOutlined,
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
  SwitcherOutlined,
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
  | 'Filter'
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
  Filter: FilterOutlined,
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
  WindowRestore: SwitcherOutlined,
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

