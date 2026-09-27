require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ReactNativeSipVoice'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: package['repository']['url'].sub('git+', ''), tag: "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Same WebRTC build react-native-webrtc links, needed for RTCAudioSession manual audio control.
  s.dependency 'JitsiWebRTC'

  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
