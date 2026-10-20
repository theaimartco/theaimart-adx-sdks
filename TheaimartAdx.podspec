Pod::Spec.new do |s|
  s.name             = 'TheaimartAdx'
  s.version          = '1.1.0'
  s.summary          = 'Official theaimart Ad Network SDK for iOS.'
  s.description      = <<-DESC
    theaimart Ad Network SDK for iOS: request ad decisions, render image/html creatives,
    and fire IAB viewability beacons. Zero third-party dependencies (URLSession + Foundation).
  DESC
  s.homepage         = 'https://adx.theaimart.co'
  s.license          = { :type => 'Apache-2.0', :file => 'LICENSE' }
  s.author           = { 'theaimart' => 'contact@theaimart.co' }
  s.source           = { :git => 'https://github.com/theaimartco/theaimart-adx-sdks.git', :tag => "v#{s.version}" }

  s.ios.deployment_target = '12.0'
  s.tvos.deployment_target = '12.0'
  s.swift_version    = '5.7'

  # Lives at the repository root so `pod lib lint` and trunk resolve the same paths.
  s.source_files     = 'packages/ios/Sources/TheaimartAdx/**/*.swift'
  s.frameworks       = 'Foundation', 'UIKit', 'WebKit'
end
