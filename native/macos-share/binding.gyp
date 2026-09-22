{
  "targets": [
    {
      "target_name": "leaf_share",
      "sources": ["share.mm"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "OTHER_LDFLAGS": ["-framework AppKit -framework Foundation"],
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "CLANG_ENABLE_OBJC_ARC": "YES"
            }
          }
        ]
      ]
    }
  ]
}
