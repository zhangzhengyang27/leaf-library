// Leaf · macOS 分享面板（NSSharingServicePicker 原生绑定）
//
// v1 行为：拉起系统分享面板（锚定当前 keyWindow），用户在面板内选择目标
// （隔空投送/信息/邮件/备忘录等）。面板自身模态运行，本调用只保证「面板已展示」，
// 不回传分享结果（NSSharingServicePicker 无可靠的关闭回调，v2 再补 delegate）。
//
// 线程：Electron 主线程即 AppKit 主线程，直接调用安全（不 dispatch）。
#include <AppKit/AppKit.h>
#include <node_api.h>
#include <vector>
#include <string>
#ifdef __cplusplus
extern "C" {
#endif

napi_value Share(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  // 参数：string[]（文件绝对路径）
  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "expected string[] of file paths");
    return nullptr;
  }
  bool is_array = false;
  napi_is_array(env, argv[0], &is_array);
  if (!is_array) {
    napi_throw_type_error(env, nullptr, "expected string[] of file paths");
    return nullptr;
  }

  uint32_t count = 0;
  napi_get_array_length(env, argv[0], &count);
  NSMutableArray<NSURL *> *items = [NSMutableArray arrayWithCapacity:count];
  for (uint32_t i = 0; i < count; i++) {
    napi_value item = nullptr;
    if (napi_get_element(env, argv[0], i, &item) != napi_ok) {
      napi_throw_type_error(env, nullptr, "failed to read array element");
      return nullptr;
    }
    napi_valuetype type = napi_undefined;
    if (napi_typeof(env, item, &type) != napi_ok) {
      napi_throw_type_error(env, nullptr, "failed to inspect array element");
      return nullptr;
    }
    // 非字符串元素显式报类型错误，不靠巧合跳过
    if (type != napi_string) {
      napi_throw_type_error(env, nullptr, "expected string[] of file paths");
      return nullptr;
    }
    size_t len = 0;
    if (napi_get_value_string_utf8(env, item, nullptr, 0, &len) != napi_ok) {
      napi_throw_type_error(env, nullptr, "expected string[] of file paths");
      return nullptr;
    }
    if (len == 0) continue;
    std::vector<char> buf(len + 1, 0);
    if (napi_get_value_string_utf8(env, item, buf.data(), len + 1, &len) != napi_ok) {
      napi_throw_type_error(env, nullptr, "failed to read path string");
      return nullptr;
    }
    NSString *path = [NSString stringWithUTF8String:buf.data()];
    NSURL *url = [NSURL fileURLWithPath:path];
    if (url) [items addObject:url];
  }
  if (items.count == 0) {
    napi_throw_type_error(env, nullptr, "no valid file paths");
    return nullptr;
  }

  NSWindow *anchor = [NSApp keyWindow] ?: [NSApp mainWindow];
  if (!anchor) {
    // 无可锚定窗口（主窗口隐藏/最小化时）→ 返回 false，调用方回退复制降级
    napi_value result = nullptr;
    napi_get_boolean(env, false, &result);
    return result;
  }

  NSSharingServicePicker *picker =
      [[NSSharingServicePicker alloc] initWithItems:items];
  NSView *view = anchor.contentView;
  if (!view) {
    // 极端情况下 keyWindow 无 contentView → 与无可锚定窗口同样走复制降级
    napi_value result = nullptr;
    napi_get_boolean(env, false, &result);
    return result;
  }
  [picker showRelativeToRect:NSMakeRect(NSMidX(view.bounds) - 1, 0, 2, 2)
                      ofView:view
               preferredEdge:NSRectEdgeMaxY];

  napi_value result = nullptr;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_value fn = nullptr;
  napi_create_function(env, "share", NAPI_AUTO_LENGTH, Share, nullptr, &fn);
  napi_set_named_property(env, exports, "share", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

#ifdef __cplusplus
}
#endif
