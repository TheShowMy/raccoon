import { useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

/* ─── 照片数据 ─────────────────────────────────── */

interface PhotoInfo {
  id: number;
  /** Picsum image ID */
  pid: number;
  title: string;
}

const PHOTOS: PhotoInfo[] = [
  { id: 1, pid: 10, title: "森林小径" },
  { id: 2, pid: 11, title: "黑色跑车" },
  { id: 3, pid: 16, title: "海岸线" },
  { id: 4, pid: 20, title: "暮色码头" },
  { id: 5, pid: 22, title: "山间薄雾" },
  { id: 6, pid: 24, title: "湖畔小屋" },
  { id: 7, pid: 26, title: "沙漠孤驼" },
  { id: 8, pid: 28, title: "城市灯火" },
  { id: 9, pid: 30, title: "冬日晨曦" },
  { id: 10, pid: 33, title: "花田漫步" },
  { id: 11, pid: 36, title: "瀑布回声" },
  { id: 12, pid: 37, title: "星空帐篷" },
  { id: 13, pid: 39, title: "古堡夕照" },
  { id: 14, pid: 40, title: "溪流石桥" },
  { id: 15, pid: 42, title: "冰封湖面" },
  { id: 16, pid: 44, title: "麦田守望" },
  { id: 17, pid: 45, title: "雨夜霓虹" },
  { id: 18, pid: 46, title: "雪中木屋" },
  { id: 19, pid: 48, title: "秋叶地毯" },
  { id: 20, pid: 49, title: "灯塔孤影" },
  { id: 21, pid: 50, title: "峡谷余晖" },
  { id: 22, pid: 51, title: "林间鹿影" },
  { id: 23, pid: 53, title: "火山熔岩" },
  { id: 24, pid: 54, title: "水下珊瑚" },
  { id: 25, pid: 55, title: "草原晨牧" },
  { id: 26, pid: 56, title: "冰川蓝洞" },
  { id: 27, pid: 57, title: "红砖巷弄" },
  { id: 28, pid: 58, title: "银河拱桥" },
  { id: 29, pid: 59, title: "向日葵田" },
  { id: 30, pid: 60, title: "岩洞奇观" },
];

function thumbUrl(pid: number): string {
  return `https://picsum.photos/id/${pid}/320/240`;
}

function fullUrl(pid: number): string {
  return `https://picsum.photos/id/${pid}/1200/800`;
}

/* ─── 缩略图卡片 ───────────────────────────────── */

interface ThumbCardProps {
  photo: PhotoInfo;
  onClick: () => void;
}

function ThumbCard({ photo, onClick }: ThumbCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]
                 cursor-pointer transition-all duration-200
                 hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent)]/10
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{ aspectRatio: "4 / 3" }}
    >
      {/* 占位背景 */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)]">
          <ImageIcon className="w-8 h-8 text-[var(--text-tertiary)]" />
        </div>
      )}

      <img
        src={thumbUrl(photo.pid)}
        alt={photo.title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* 底部标题遮罩 */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-2
                    bg-gradient-to-t from-black/70 to-transparent"
      >
        <span className="text-xs font-medium text-white truncate block">
          {photo.title}
        </span>
      </div>
    </button>
  );
}

/* ─── 大图灯箱 ─────────────────────────────────── */

interface LightboxProps {
  photo: PhotoInfo;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function Lightbox({ photo, index, total, onClose, onPrev, onNext }: LightboxProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-black/90 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="照片预览"
      aria-modal="true"
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-sm text-white/70">
          {photo.title} — {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-full
                     bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="关闭"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* 图像区域 */}
      <div
        className="flex-1 flex items-center justify-center min-h-0 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 占位 */}
        {!loaded && (
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        <img
          src={fullUrl(photo.pid)}
          alt={photo.title}
          onLoad={() => setLoaded(true)}
          className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0 absolute"
          }`}
        />
      </div>

      {/* 底部翻页 */}
      <div className="flex items-center justify-center gap-6 px-4 py-4 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          disabled={index === 0}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm text-white/70
                     bg-white/10 hover:bg-white/20 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          上一张
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          disabled={index === total - 1}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm text-white/70
                     bg-white/10 hover:bg-white/20 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          下一张
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── 主组件 ───────────────────────────────────── */

export function Photos() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const openPhoto = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const closePhoto = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const goPrev = useCallback(() => {
    setSelectedIndex((prev) =>
      prev !== null && prev > 0 ? prev - 1 : prev,
    );
  }, []);

  const goNext = useCallback(() => {
    setSelectedIndex((prev) =>
      prev !== null && prev < PHOTOS.length - 1 ? prev + 1 : prev,
    );
  }, []);

  /* 键盘快捷键 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "Escape") {
        closePhoto();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    },
    [selectedIndex, closePhoto, goPrev, goNext],
  );

  return (
    <div
      className="relative h-full w-full overflow-auto p-4"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* 标题 */}
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
        照片预览
      </h2>

      {/* 响应式网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 auto-rows-auto">
        {PHOTOS.map((photo, index) => (
          <ThumbCard
            key={photo.id}
            photo={photo}
            onClick={() => openPhoto(index)}
          />
        ))}
      </div>

      {/* 灯箱 */}
      {selectedIndex !== null && (
        <Lightbox
          photo={PHOTOS[selectedIndex]}
          index={selectedIndex}
          total={PHOTOS.length}
          onClose={closePhoto}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </div>
  );
}
