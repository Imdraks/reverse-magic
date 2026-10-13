"""Generate a deterministic Xcode project; standard library only."""
import hashlib, json
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree
root=Path(__file__).resolve().parent
objects={}
def ident(name):return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def obj(identity, **attrs):
 k=ident(identity);objects[k]=attrs;return k
appfiles=['LanternApp.swift','LanternProtocol.swift','WriteQueue.swift','BluetoothController.swift','ContentView.swift','AudioMeter.swift','EffectCatalog.swift']
testfiles=['ProtocolTests.swift','WriteQueueTests.swift']
apprefs=[];appbuild=[];testrefs=[];testbuild=[]
for f in appfiles:
 ref=obj('file:'+f,isa='PBXFileReference',lastKnownFileType='sourcecode.swift',path=f,sourceTree='<group>');apprefs.append(ref)
 appbuild.append(obj('build:'+f,isa='PBXBuildFile',fileRef=ref))
for f in testfiles:
 ref=obj('file:'+f,isa='PBXFileReference',lastKnownFileType='sourcecode.swift',path=f,sourceTree='<group>');testrefs.append(ref)
 testbuild.append(obj('build:'+f,isa='PBXBuildFile',fileRef=ref))
plist=obj('file:Info.plist',isa='PBXFileReference',lastKnownFileType='text.plist.xml',path='Info.plist',sourceTree='<group>')
appProduct=obj('product:app',isa='PBXFileReference',explicitFileType='wrapper.application',includeInIndex=0,path='LanternDirect.app',sourceTree='BUILT_PRODUCTS_DIR')
testProduct=obj('product:test',isa='PBXFileReference',explicitFileType='wrapper.cfbundle',includeInIndex=0,path='LanternDirectTests.xctest',sourceTree='BUILT_PRODUCTS_DIR')
appGroup=obj('group:app',isa='PBXGroup',children=apprefs+[plist],path='MagicLantern',sourceTree='<group>')
testsGroup=obj('group:tests',isa='PBXGroup',children=testrefs,path='Tests/LanternProtocolTests',sourceTree='<group>')
productsGroup=obj('group:products',isa='PBXGroup',children=[appProduct,testProduct],name='Products',sourceTree='<group>')
mainGroup=obj('group:main',isa='PBXGroup',children=[appGroup,testsGroup,productsGroup],sourceTree='<group>')
projectID=ident('project'); appID=ident('target:app');testID=ident('target:tests')
appSource=obj('sources:app',isa='PBXSourcesBuildPhase',buildActionMask=2147483647,files=appbuild,runOnlyForDeploymentPostprocessing=0)
testSource=obj('sources:test',isa='PBXSourcesBuildPhase',buildActionMask=2147483647,files=testbuild,runOnlyForDeploymentPostprocessing=0)
appFrameworks=obj('frameworks:app',isa='PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0)
testFrameworks=obj('frameworks:test',isa='PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0)
resources=obj('resources:app',isa='PBXResourcesBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0)
proxy=obj('proxy',isa='PBXContainerItemProxy',containerPortal=projectID,proxyType=1,remoteGlobalIDString=appID,remoteInfo='LanternDirect')
dependency=obj('dependency',isa='PBXTargetDependency',target=appID,targetProxy=proxy)
def configurations(name,settings):
 refs=[]
 for mode in ['Debug','Release']:
  s=dict(settings)
  if name=='project':
   s.update({'SWIFT_OPTIMIZATION_LEVEL':'-Onone' if mode=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf' if mode=='Debug' else 'dwarf-with-dsym'})
   if mode=='Debug':s.update({'ENABLE_TESTABILITY':'YES','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG'})
  refs.append(obj('config:'+name+mode,isa='XCBuildConfiguration',buildSettings=s,name=mode))
 return obj('configlist:'+name,isa='XCConfigurationList',buildConfigurations=refs,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
projectConfig=configurations('project',{'IPHONEOS_DEPLOYMENT_TARGET':'17.0','SDKROOT':'iphoneos','SWIFT_VERSION':'5.0','CLANG_ENABLE_MODULES':'YES','CLANG_ENABLE_OBJC_ARC':'YES','SWIFT_STRICT_CONCURRENCY':'minimal'})
appConfig=configurations('app',{'CODE_SIGN_STYLE':'Automatic','PRODUCT_BUNDLE_IDENTIFIER':'com.example.lanterndirect','PRODUCT_NAME':'LanternDirect','PRODUCT_MODULE_NAME':'LanternProtocol','TARGETED_DEVICE_FAMILY':'1,2','INFOPLIST_FILE':'MagicLantern/Info.plist','GENERATE_INFOPLIST_FILE':'NO','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','SUPPORTS_MACCATALYST':'NO','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/Frameworks']})
testConfig=configurations('tests',{'CODE_SIGN_STYLE':'Automatic','PRODUCT_BUNDLE_IDENTIFIER':'com.example.lanterndirect.tests','PRODUCT_NAME':'$(TARGET_NAME)','TARGETED_DEVICE_FAMILY':'1,2','GENERATE_INFOPLIST_FILE':'YES','TEST_HOST':'$(BUILT_PRODUCTS_DIR)/LanternDirect.app/LanternDirect','BUNDLE_LOADER':'$(TEST_HOST)','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/Frameworks','@loader_path/Frameworks']})
obj('target:app',isa='PBXNativeTarget',buildConfigurationList=appConfig,buildPhases=[appSource,appFrameworks,resources],buildRules=[],dependencies=[],name='LanternDirect',productName='LanternDirect',productReference=appProduct,productType='com.apple.product-type.application')
obj('target:tests',isa='PBXNativeTarget',buildConfigurationList=testConfig,buildPhases=[testSource,testFrameworks],buildRules=[],dependencies=[dependency],name='LanternDirectTests',productName='LanternDirectTests',productReference=testProduct,productType='com.apple.product-type.bundle.unit-test')
obj('project',isa='PBXProject',attributes={'LastUpgradeCheck':'1600','TargetAttributes':{appID:{'CreatedOnToolsVersion':'16.0'},testID:{'CreatedOnToolsVersion':'16.0','TestTargetID':appID}}},buildConfigurationList=projectConfig,compatibilityVersion='Xcode 14.0',developmentRegion='fr',hasScannedForEncodings=0,knownRegions=['fr','en','Base'],mainGroup=mainGroup,productRefGroup=productsGroup,projectDirPath='',projectRoot='',targets=[appID,testID])
def fmt(v,level=0):
 if isinstance(v,dict):return '{\n'+''.join('\t'*(level+1)+json.dumps(k)+' = '+fmt(x,level+1)+';\n' for k,x in v.items())+'\t'*level+'}'
 if isinstance(v,list):return '('+', '.join(fmt(x,level) for x in v)+')'
 return str(v) if isinstance(v,int) else json.dumps(v)
project=root/'LanternDirect.xcodeproj';project.mkdir(exist_ok=True)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n'+fmt({'archiveVersion':1,'classes':{},'objectVersion':56,'objects':objects,'rootObject':projectID})+'\n')
scheme=Element('Scheme',LastUpgradeVersion='1600',version='1.7')
def ref(parent,target,name,product):SubElement(parent,'BuildableReference',BuildableIdentifier='primary',BlueprintIdentifier=target,BuildableName=product,BlueprintName=name,ReferencedContainer='container:LanternDirect.xcodeproj')
build=SubElement(scheme,'BuildAction',parallelizeBuildables='YES',buildImplicitDependencies='YES');entries=SubElement(build,'BuildActionEntries')
e=SubElement(entries,'BuildActionEntry',buildForTesting='YES',buildForRunning='YES',buildForProfiling='YES',buildForArchiving='YES',buildForAnalyzing='YES');ref(e,appID,'LanternDirect','LanternDirect.app')
e=SubElement(entries,'BuildActionEntry',buildForTesting='YES',buildForRunning='NO',buildForProfiling='NO',buildForArchiving='NO',buildForAnalyzing='YES');ref(e,testID,'LanternDirectTests','LanternDirectTests.xctest')
test=SubElement(scheme,'TestAction',buildConfiguration='Debug',selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB',selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB',shouldUseLaunchSchemeArgsEnv='YES')
testables=SubElement(test,'Testables');t=SubElement(testables,'TestableReference',skipped='NO');ref(t,testID,'LanternDirectTests','LanternDirectTests.xctest')
launch=SubElement(scheme,'LaunchAction',buildConfiguration='Debug',selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB',selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB',launchStyle='0',useCustomWorkingDirectory='NO',ignoresPersistentStateOnLaunch='NO',debugDocumentVersioning='YES',debugServiceExtension='internal',allowLocationSimulation='YES')
runnable=SubElement(launch,'BuildableProductRunnable',runnableDebuggingMode='0');ref(runnable,appID,'LanternDirect','LanternDirect.app')
profile=SubElement(scheme,'ProfileAction',buildConfiguration='Release',shouldUseLaunchSchemeArgsEnv='YES',savedToolIdentifier='',useCustomWorkingDirectory='NO',debugDocumentVersioning='YES');runnable=SubElement(profile,'BuildableProductRunnable',runnableDebuggingMode='0');ref(runnable,appID,'LanternDirect','LanternDirect.app')
SubElement(scheme,'AnalyzeAction',buildConfiguration='Debug');SubElement(scheme,'ArchiveAction',buildConfiguration='Release',revealArchiveInOrganizer='YES')
schemedir=project/'xcshareddata/xcschemes';schemedir.mkdir(parents=True,exist_ok=True);ElementTree(scheme).write(schemedir/'LanternDirect.xcscheme',encoding='utf-8',xml_declaration=True)
print('Generated Xcode app and unit-test targets.')
