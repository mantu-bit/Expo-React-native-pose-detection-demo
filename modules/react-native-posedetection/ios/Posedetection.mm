// Posedetection.mm
#import "Posedetection.h"
#import <React/RCTLog.h>
#import <objc/runtime.h>

// Import MediaPipe
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>

// Import VisionCamera if available
#if __has_include(<VisionCamera/FrameProcessorPlugin.h>)
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>
#define VISION_CAMERA_AVAILABLE 1
#else
#define VISION_CAMERA_AVAILABLE 0
#endif

// Import Swift header
#if __has_include("Posedetection/Posedetection-Swift.h")
#import "Posedetection/Posedetection-Swift.h"
#else
#import "Posedetection-Swift.h"
#endif


@interface Posedetection()
@property(nonatomic, strong) id resultProcessor;
@property(nonatomic) BOOL isModelInitialized;
@end

@implementation Posedetection

// MARK: - Module Setup

+ (NSString *)moduleName {
    return @"Posedetection";
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _isModelInitialized = NO;
    }
    return self;
}


- (NSNumber *)multiply:(double)a b:(double)b {
    return @(a * b);
}

- (void)initModel:(RCTPromiseResolveBlock)resolve 
         reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self initModelInternal:resolve rejecter:reject];
    });
}

- (void)initModelInternal:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject {
    @try {
        Class processorClass = NSClassFromString(@"Posedetection.PoseLandmarkerResultProcessor");
        if (!processorClass) {
            processorClass = NSClassFromString(@"PoseLandmarkerResultProcessor");
        }
        
        if (processorClass) {
            SEL initSelector = NSSelectorFromString(@"initWithEventEmitter:");
            if ([processorClass instancesRespondToSelector:initSelector]) {
                self.resultProcessor = [[processorClass alloc] performSelector:initSelector 
                                                                    withObject:self];
            }
        } else {
            RCTLogWarn(@"⚠️ PoseLandmarkerResultProcessor class not found");
        }
        
        NSString *modelPath = [[NSBundle mainBundle] pathForResource:@"pose_landmarker_lite" 
                                                               ofType:@"task"];
        
        if (!modelPath) {
            NSBundle *moduleBundle = [NSBundle bundleForClass:[self class]];
            modelPath = [moduleBundle pathForResource:@"pose_landmarker_lite" 
                                               ofType:@"task"];
        }
        
        if (!modelPath) {
            reject(@"MODEL_NOT_FOUND", 
                   @"Pose landmark model file not found. Add pose_landmarker_lite.task to your Xcode project.", 
                   nil);
            return;
        }
        
        RCTLogInfo(@"📦 Model found at: %@", modelPath);
        
        MPPPoseLandmarkerOptions *options = [[MPPPoseLandmarkerOptions alloc] init];
        options.baseOptions.modelAssetPath = modelPath;
        options.runningMode = MPPRunningModeLiveStream;
        options.minPoseDetectionConfidence = 0.5;
        options.minPosePresenceConfidence = 0.5;
        options.minTrackingConfidence = 0.5;
        options.numPoses = 1;
        
        if (self.resultProcessor) {
            options.poseLandmarkerLiveStreamDelegate = self.resultProcessor;
        }
        
        NSError *error = nil;
        Class holderClass = NSClassFromString(@"Posedetection.PoseLandmarkerHolder");
        if (!holderClass) {
            holderClass = NSClassFromString(@"PoseLandmarkerHolder");
        }
        
        if (holderClass) {
            id sharedHolder = [holderClass performSelector:@selector(shared)];
            
            SEL initSelector = NSSelectorFromString(@"initializePoseLandmarkerWith:error:");
            if ([sharedHolder respondsToSelector:initSelector]) {
                NSMethodSignature *signature = [sharedHolder methodSignatureForSelector:initSelector];
                NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
                [invocation setTarget:sharedHolder];
                [invocation setSelector:initSelector];
                [invocation setArgument:&options atIndex:2];
                [invocation setArgument:&error atIndex:3];
                [invocation invoke];
            }
        } else {
            reject(@"INIT_ERROR", 
                   @"PoseLandmarkerHolder class not found.", 
                   nil);
            return;
        }
        
        if (error) {
            reject(@"INIT_ERROR", 
                   [NSString stringWithFormat:@"Failed to initialize: %@", error.localizedDescription], 
                   error);
            return;
        }
        
        self.isModelInitialized = YES;
        RCTLogInfo(@"✅ PoseLandmarker initialized successfully");
        
        resolve(@(YES));
        [self emitOnPoseLandmarksStatus:@{@"status": @"initialized"}];
        
    } @catch (NSException *exception) {
        reject(@"INIT_EXCEPTION", exception.reason, nil);
    }
}

- (void)testEmit {
    RCTLogInfo(@"🔔 testEmit called");
    [self emitOnPoseLandmarksStatus:@{@"status": @"test emit called"}];
}

- (void)triggerMockDetection {
    RCTLogInfo(@"🎭 triggerMockDetection called");
    
    NSArray *mockLandmark = @[@{
        @"keypoint": @(0),
        @"x": @(0.5),
        @"y": @(0.5),
        @"z": @(0.0),
        @"visibility": @(0.99),
        @"presence": @(0.99)
    }];
    
    [self emitOnPoseLandmarksDetected:@{@"landmarks": @[mockLandmark]}];
}

- (void)sendPoseLandmarksWithParams:(NSDictionary *)params {
    [self emitOnPoseLandmarksDetected:params];
}

- (void)sendPoseErrorWithError:(NSString *)error {
    [self emitOnPoseLandmarksError:@{@"error": error}];
}

- (void)sendPoseStatusWithStatus:(NSString *)status {
    [self emitOnPoseLandmarksStatus:@{@"status": status}];
}

- (void)addListener:(NSString *)eventName {
}

- (void)removeListeners:(double)count {
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativePosedetectionSpecJSI>(params);
}

@end

// MARK: - Frame Processor Registration (separate category)
#if VISION_CAMERA_AVAILABLE

@interface PoseLandmarksFrameProcessorPlugin (FrameProcessorPluginLoader)
@end

@implementation PoseLandmarksFrameProcessorPlugin (FrameProcessorPluginLoader)

+ (void)load {
    RCTLogInfo(@"🔌 Registering frame processor plugin: poseLandmarks");
    [FrameProcessorPluginRegistry addFrameProcessorPlugin:@"poseLandmarks"
                                          withInitializer:^FrameProcessorPlugin*(VisionCameraProxyHolder* proxy, NSDictionary* options) {
        return [[PoseLandmarksFrameProcessorPlugin alloc] initWithProxy:proxy withOptions:options];
    }];
}

@end

#endif
