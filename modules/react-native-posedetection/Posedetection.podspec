require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "Posedetection"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => ".git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  s.dependency 'MediaPipeTasksVision', '~> 0.10.14'
  s.dependency "VisionCamera"

    # For TurboModule support
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\" \"$(PODS_ROOT)/Headers/Private/React-Core\"",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "DEFINES_MODULE" => "YES"
  }
  
  s.dependency "React-Codegen"
  s.dependency "RCT-Folly"
  s.dependency "RCTRequired"
  s.dependency "RCTTypeSafety"
  s.dependency "ReactCommon/turbomodule/core"
  
  install_modules_dependencies(s)
end
